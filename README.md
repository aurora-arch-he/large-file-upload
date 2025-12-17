# 大文件上传 SDK / Large File Upload SDK

[![npm](https://img.shields.io/npm/v/large-file-upload-sdk)](https://www.npmjs.com/package/large-file-upload-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个支持分片上传、断点续传和秒传功能的 JavaScript SDK。
A JavaScript SDK that supports chunked upload, resumable upload, and instant transfer.

## 功能特性 / Features

1. **分片上传** - 将大文件分割成小块分别上传，提高上传稳定性
   **Chunked Upload** - Split large files into small chunks for upload, improving upload stability

2. **断点续传** - 上传中断后可从中断处继续上传
   **Resumable Upload** - Resume upload from breakpoint after interruption

3. **秒传功能** - 若服务器已存在相同文件，则瞬间完成上传
   **Instant Transfer** - Instantly complete upload if the same file already exists on the server

4. **并发控制** - 控制同时上传的文件数量和分片数量，避免浏览器卡顿
   **Concurrency Control** - Control the number of simultaneous file and chunk uploads to avoid browser lag

5. **进度追踪** - 实时显示上传进度
   **Progress Tracking** - Display upload progress in real-time

6. **错误重试** - 自动重试失败的上传请求
   **Error Retry** - Automatically retry failed upload requests

7. **Web Worker优化** - MD5计算在后台线程进行，不阻塞主线程
   **Web Worker Optimization** - MD5 calculation runs in background thread without blocking the main thread

8. **取消上传** - 支持取消正在进行的上传任务
   **Cancel Upload** - Support for canceling ongoing upload tasks

## 安装和使用 / Installation and Usage

### 通过 npm 安装 / Install via npm

```bash
npm install large-file-upload-sdk
```

### 通过 yarn 安装 / Install via yarn

```bash
yarn add large-file-upload-sdk
```

### 通过 CDN 引入 / Include via CDN

```html
<script src="https://cdn.jsdelivr.net/npm/large-file-upload-sdk@latest/dist/bundle.js"></script>
```

### 构建项目 / Build Project

```bash
npm run build
```

### 启动演示服务器 / Start Demo Server

```bash
npm run test
```

然后访问 `http://localhost:3000` 查看演示。
Then visit `http://localhost:3000` to view the demo.

## SDK 使用方法 / SDK Usage

### 引入 SDK / Import SDK

```javascript
// ES6 模块引入方式
import FileUploader from 'large-file-upload-sdk';

// 或者在 HTML 中通过 script 标签引入
// <script src="./dist/bundle.js"></script>
```

### 初始化上传器 / Initialize Uploader

```javascript
const uploader = new FileUploader({
  // 必须配置所有API端点 / Must configure all API endpoints
  checkEndpoint: '/api/upload/check',   // 检查文件状态接口 / Check file status endpoint
  chunkEndpoint: '/api/upload/chunk',   // 上传分片接口 / Upload chunk endpoint
  mergeEndpoint: '/api/upload/merge',   // 合并文件接口 / Merge file endpoint
  
  // 上传配置（可选） / Upload configuration (optional)
  chunkSize: 2 * 1024 * 1024,          // 分片大小，默认为 2MB / Chunk size, default is 2MB
  concurrentFiles: 3,                   // 最大同时上传文件数，默认为 3 / Max concurrent file uploads, default is 3
  concurrentChunks: 3,                  // 每个文件最大同时上传分片数，默认为 3 / Max concurrent chunk uploads per file, default is 3
  maxRetries: 3                         // 请求失败最大重试次数，默认为 3 / Max retry attempts for failed requests, default is 3
});
```

### 添加文件 / Add Files

```javascript
// 添加文件列表（来自 input 或拖拽） / Add file list (from input or drag & drop)
uploader.addFiles(fileList);
```

### 取消上传 / Cancel Upload

```javascript
// 取消特定文件的上传 / Cancel upload for a specific file
uploader.cancelUpload(fileId);
```

### 监听状态变化 / Listen to Status Changes

```javascript
uploader.updateFileStatus = function(fileItem) {
  // 在这里更新你的 UI / Update your UI here
  console.log(`文件 ${fileItem.name}: ${fileItem.status} (${fileItem.progress}%)`);
  console.log(`File ${fileItem.name}: ${fileItem.status} (${fileItem.progress}%)`);
};
```

### 获取文件列表 / Get File List

```javascript
const files = uploader.getFiles();
```

### 清理资源 / Cleanup Resources

```javascript
// 在组件销毁或页面卸载时调用 / Call when component is destroyed or page is unloaded
uploader.destroy();
```

## API 接口规范 / API Specification

服务器需要提供以下三个接口：
The server needs to provide the following three interfaces:

### 1. 检查文件状态 / Check File Status

```
POST /api/upload/check

请求体: / Request Body:
{
  "md5": "文件MD5值",     // File MD5 value
  "filename": "原始文件名" // Original filename
}

响应: / Response:
{
  "exists": true/false,         // 文件是否已存在（秒传） / Whether the file already exists (instant transfer)
  "path": "文件路径",            // File path (only when exists=true)
  "uploadedChunks": [0, 1, 3]   // 已上传的分片索引数组（仅 exists=false 时） / Uploaded chunk indices array (only when exists=false)
}
```

### 2. 上传分片 / Upload Chunk

```
POST /api/upload/chunk

表单数据: / Form Data:
- file: 分片文件 / Chunk file
- md5: 文件MD5值 / File MD5 value
- chunkIndex: 分片索引 / Chunk index
- totalChunks: 总分片数 / Total chunks

响应: / Response:
{
  "success": true
}
```

### 3. 合并文件 / Merge File

```
POST /api/upload/merge

请求体: / Request Body:
{
  "md5": "文件MD5值",     // File MD5 value
  "filename": "原始文件名", // Original filename
  "totalChunks": 10       // 总分片数 / Total chunks
}

响应: / Response:
{
  "success": true,
  "path": "文件存储路径"   // File storage path
}
```

## 技术实现细节 / Technical Implementation Details

### 文件唯一标识 / File Unique Identification

使用 MD5 值作为文件的唯一标识，通过 Web Worker 在后台线程中使用 SparkMD5 库增量计算大文件的 MD5 值，避免阻塞主线程和内存溢出。
Use MD5 value as the unique identifier of the file. Incrementally calculate the MD5 value of large files using the SparkMD5 library in a Web Worker background thread to avoid blocking the main thread and memory overflow.

### 并发控制 / Concurrency Control

通过两个层级的并发控制：
Concurrency control through two levels:
1. 文件级并发：控制同时上传的文件数量
   File-level concurrency: Control the number of files uploaded simultaneously
2. 分片级并发：控制单个文件同时上传的分片数量
   Chunk-level concurrency: Control the number of chunks uploaded simultaneously for a single file

### 错误处理与重试 / Error Handling and Retry

采用指数退避策略进行重试，增加上传成功率。
Use exponential backoff strategy for retries to increase upload success rate.

### 断点续传实现 / Resumable Upload Implementation

上传前先检查服务器已存在的分片，只上传缺失的分片。
Check existing chunks on the server before uploading and only upload missing chunks.

### 秒传实现 / Instant Transfer Implementation

上传前检查服务器是否已存在相同 MD5 的文件，若存在则直接返回成功。
Check if a file with the same MD5 already exists on the server before uploading. If it exists, return success directly.

### Web Worker 优化 / Web Worker Optimization

使用 Web Worker 在后台线程计算 MD5，避免阻塞主线程影响用户体验。Worker中通过CDN动态加载SparkMD5库进行计算。
Use Web Worker to calculate MD5 in a background thread to avoid blocking the main thread and affecting user experience. The Worker dynamically loads the SparkMD5 library via CDN for calculation.

## 浏览器兼容性 / Browser Compatibility

支持所有现代浏览器（Chrome, Firefox, Safari, Edge）。
Supports all modern browsers (Chrome, Firefox, Safari, Edge).

## 许可证 / License

MIT# Large-File-Upload
# large-file-upload
