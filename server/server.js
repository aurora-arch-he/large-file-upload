const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');

const app = express();
const port = 3000;

// 创建必要的目录
const tempDir = path.join(__dirname, '..', 'temp');
const uploadDir = path.join(__dirname, '..', 'uploads');

// 确保目录存在
if (!fsSync.existsSync(tempDir)) {
  fsSync.mkdirSync(tempDir, { recursive: true });
}

if (!fsSync.existsSync(uploadDir)) {
  fsSync.mkdirSync(uploadDir, { recursive: true });
}

// 文件索引路径
const indexPath = path.join(__dirname, '..', 'index.json');

// 初始化文件索引
let fileIndex = {};
try {
  if (fsSync.existsSync(indexPath)) {
    fileIndex = JSON.parse(fsSync.readFileSync(indexPath, 'utf8'));
  }
} catch (err) {
  console.error('Failed to read index file:', err);
}

// 保存文件索引
function saveIndex() {
  fsSync.writeFileSync(indexPath, JSON.stringify(fileIndex, null, 2));
}

// 配置multer用于处理文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // 临时文件名
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 限制单个文件10MB
  }
});

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/dist', express.static(path.join(__dirname, '..', 'dist')));

// CORS 处理
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 检查文件状态接口
app.post('/api/upload/check', async (req, res) => {
  try {
    const { md5, filename } = req.body;
    
    console.log(`Checking file: ${filename} with MD5: ${md5}`);
    
    // 1. 检查是否已有完整文件（秒传）
    if (fileIndex[md5]) {
      console.log(`Instant transfer for file: ${filename}`);
      return res.json({
        exists: true,
        path: fileIndex[md5],
        uploadedChunks: []
      });
    }
    
    // 2. 检查是否有部分上传的分片（断点续传）
    const fileTempDir = path.join(tempDir, md5);
    let uploadedChunks = [];
    
    try {
      if (fsSync.existsSync(fileTempDir)) {
        const files = await fs.readdir(fileTempDir);
        uploadedChunks = files
          .filter(name => name.endsWith('.chunk'))
          .map(name => parseInt(name.split('.')[0]))
          .sort((a, b) => a - b);
          
        console.log(`Resume upload for file: ${filename}, chunks: ${uploadedChunks.length}`);
      }
    } catch (err) {
      console.error('Error reading temp directory:', err);
    }
    
    return res.json({
      exists: false,
      uploadedChunks
    });
  } catch (error) {
    console.error('Check file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 上传分片接口
app.post('/api/upload/chunk', upload.single('file'), async (req, res) => {
  try {
    const { md5, chunkIndex } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log(`Uploading chunk ${chunkIndex} for file with MD5: ${md5}`);
    
    // 创建文件临时目录
    const fileTempDir = path.join(tempDir, md5);
    if (!fsSync.existsSync(fileTempDir)) {
      await fs.mkdir(fileTempDir, { recursive: true });
    }
    
    // 移动文件到正确位置
    const chunkPath = path.join(fileTempDir, `${chunkIndex}.chunk`);
    await fs.rename(req.file.path, chunkPath);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Upload chunk error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 合并文件接口
app.post('/api/upload/merge', async (req, res) => {
  try {
    const { md5, filename, totalChunks } = req.body;
    
    console.log(`Merging file: ${filename} with MD5: ${md5}`);
    
    const fileTempDir = path.join(tempDir, md5);
    const finalPath = path.join(uploadDir, `${md5}_${filename}`);
    
    // 检查所有分片是否存在
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(fileTempDir, `${i}.chunk`);
      if (!fsSync.existsSync(chunkPath)) {
        return res.status(400).json({ error: `Missing chunk ${i}` });
      }
    }
    
    // 创建写入流
    const writeStream = fsSync.createWriteStream(finalPath);
    
    // 按顺序合并所有分片
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(fileTempDir, `${i}.chunk`);
      const chunkData = await fs.readFile(chunkPath);
      writeStream.write(chunkData);
    }
    
    writeStream.end();
    
    // 等待写入完成
    await new Promise((resolve) => {
      writeStream.on('finish', resolve);
    });
    
    // 删除临时分片
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(fileTempDir, `${i}.chunk`);
      await fs.unlink(chunkPath);
    }
    
    // 删除临时目录
    await fs.rmdir(fileTempDir);
    
    // 更新文件索引
    fileIndex[md5] = finalPath;
    saveIndex();
    
    console.log(`File merged successfully: ${finalPath}`);
    
    res.json({ success: true, path: finalPath });
  } catch (error) {
    console.error('Merge file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});