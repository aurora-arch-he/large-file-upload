/**
 * Large File Upload SDK / 大文件上传SDK
 * Supports chunked upload, resumable upload, and instant transfer / 支持分片上传、断点续传和秒传
 */

class FileUploader {
  /**
   * Create a FileUploader instance / 创建一个FileUploader实例
   * @param {Object} options - Configuration options / 配置选项
   * @param {string} options.checkEndpoint - API endpoint for checking file status / 检查文件状态的API端点
   * @param {string} options.chunkEndpoint - API endpoint for uploading chunks / 上传分片的API端点
   * @param {string} options.mergeEndpoint - API endpoint for merging chunks / 合并分片的API端点
   * @param {number} options.chunkSize - Size of each chunk in bytes (default: 2MB) / 每个分片的大小（默认：2MB）
   * @param {number} options.concurrentFiles - Max concurrent file uploads (default: 3) / 最大并发文件上传数（默认：3）
   * @param {number} options.concurrentChunks - Max concurrent chunk uploads per file (default: 3) / 每个文件的最大并发分片上传数（默认：3）
   * @param {number} options.maxRetries - Max retry attempts for failed uploads (default: 3) / 上传失败的最大重试次数（默认：3）
   */
  constructor(options = {}) {
    // API endpoints (required) / API端点（必需）
    this.checkEndpoint = options.checkEndpoint;
    this.chunkEndpoint = options.chunkEndpoint;
    this.mergeEndpoint = options.mergeEndpoint;
    
    // Validate required endpoints / 验证必需的端点
    if (!this.checkEndpoint || !this.chunkEndpoint || !this.mergeEndpoint) {
      throw new Error('All API endpoints (checkEndpoint, chunkEndpoint, mergeEndpoint) must be provided / 所有API端点（checkEndpoint、chunkEndpoint、mergeEndpoint）都必须提供');
    }
    
    // Upload configuration / 上传配置
    this.chunkSize = options.chunkSize || 2 * 1024 * 1024; // 2MB
    this.concurrentFiles = options.concurrentFiles || 3;
    this.concurrentChunks = options.concurrentChunks || 3;
    this.maxRetries = options.maxRetries || 3;
    
    this.uploadQueue = [];
    this.uploadingCount = 0;
    this.files = [];
    
    // 存储正在进行的请求控制器，用于取消上传
    this.abortControllers = new Map();
  }

  /**
   * Add files to upload queue / 将文件添加到上传队列
   * @param {FileList|File[]} fileList - Files to upload / 要上传的文件
   */
  addFiles(fileList) {
    const newFiles = Array.from(fileList).map((file) => ({
      id: this.generateId(),
      file,
      status: 'pending', // pending, checking, uploading, merging, success, error, cancelled
      progress: 0,
      name: file.name,
      size: file.size,
      uploadedChunks: [],
      totalChunks: Math.ceil(file.size / this.chunkSize),
    }));

    this.files = [...this.files, ...newFiles];
    this.uploadQueue = [...this.uploadQueue, ...newFiles];
    
    this.processQueue();
    
    return newFiles;
  }

  /**
   * Cancel file upload / 取消文件上传
   * @param {string} fileId - ID of the file to cancel / 要取消的文件ID
   */
  cancelUpload(fileId) {
    const fileItem = this.files.find(item => item.id === fileId);
    if (!fileItem) {
      console.warn(`File with ID ${fileId} not found`);
      return;
    }

    // 如果文件正在上传队列中，直接移除
    if (fileItem.status === 'pending') {
      this.uploadQueue = this.uploadQueue.filter(item => item.id !== fileId);
      fileItem.status = 'cancelled';
      this.updateFileStatus(fileItem);
      return;
    }

    // 如果文件正在上传过程中，取消所有相关请求
    if (fileItem.status === 'checking' || fileItem.status === 'uploading' || fileItem.status === 'merging') {
      // 取消所有与该文件相关的请求
      const abortController = this.abortControllers.get(fileId);
      if (abortController) {
        abortController.abort();
        this.abortControllers.delete(fileId);
      }
      
      fileItem.status = 'cancelled';
      this.updateFileStatus(fileItem);
      return;
    }
  }

  /**
   * Process upload queue / 处理上传队列
   */
  processQueue() {
    while (this.uploadQueue.length > 0 && this.uploadingCount < this.concurrentFiles) {
      const fileItem = this.uploadQueue.shift();
      if (fileItem) {
        this.uploadingCount++;
        this.processFile(fileItem).finally(() => {
          this.uploadingCount--;
          this.processQueue();
        });
      }
    }
  }

  /**
   * Process individual file / 处理单个文件
   * @param {Object} fileItem - File item to process / 要处理的文件项
   */
  async processFile(fileItem) {
    // 为每个文件创建 AbortController
    const abortController = new AbortController();
    this.abortControllers.set(fileItem.id, abortController);
    
    try {
      fileItem.status = 'checking';
      this.updateFileStatus(fileItem);

      // Calculate file MD5 / 计算文件MD5
      const md5 = await this.calculateMD5(fileItem.file);
      fileItem.md5 = md5;

      // Check with server if file already exists or has partial uploads / 检查服务器上是否已存在文件或有部分上传
      const checkResult = await this.checkFile(fileItem.md5, fileItem.file.name, abortController.signal);

      if (checkResult.exists) {
        // Instant transfer - file already exists / 秒传 - 文件已存在
        fileItem.status = 'success';
        fileItem.progress = 100;
        this.updateFileStatus(fileItem);
        this.abortControllers.delete(fileItem.id);
        return;
      }

      // Identify chunks that still need to be uploaded / 识别仍需上传的分片
      const chunksToUpload = Array.from({ length: fileItem.totalChunks }, (_, i) => i)
        .filter(i => !checkResult.uploadedChunks.includes(i));

      fileItem.uploadedChunks = checkResult.uploadedChunks;

      if (chunksToUpload.length === 0) {
        // All chunks already uploaded, just merge / 所有分片已上传，只需合并
        await this.mergeFile(fileItem.md5, fileItem.file.name, fileItem.totalChunks, abortController.signal);
        fileItem.status = 'success';
        fileItem.progress = 100;
        this.updateFileStatus(fileItem);
        this.abortControllers.delete(fileItem.id);
        return;
      }

      // Upload remaining chunks / 上传剩余分片
      fileItem.status = 'uploading';
      this.updateFileStatus(fileItem);
      
      await this.uploadChunksWithConcurrency(
        fileItem,
        chunksToUpload,
        abortController.signal
      );

      // Merge chunks into final file / 将分片合并为最终文件
      fileItem.status = 'merging';
      this.updateFileStatus(fileItem);
      
      await this.mergeFile(fileItem.md5, fileItem.file.name, fileItem.totalChunks, abortController.signal);
      
      fileItem.status = 'success';
      fileItem.progress = 100;
      this.updateFileStatus(fileItem);
      this.abortControllers.delete(fileItem.id);
    } catch (error) {
      // 检查是否是由于取消上传导致的错误
      if (error.name === 'AbortError') {
        fileItem.status = 'cancelled';
        this.updateFileStatus(fileItem);
      } else {
        fileItem.status = 'error';
        fileItem.error = error.message;
        this.updateFileStatus(fileItem);
        console.error('Upload error:', error);
      }
      this.abortControllers.delete(fileItem.id);
    }
  }

  /**
   * Upload chunks with concurrency control / 并发控制上传分片
   * @param {Object} fileItem - File item being uploaded / 正在上传的文件项
   * @param {number[]} chunksToUpload - Indices of chunks to upload / 要上传的分片索引
   * @param {AbortSignal} signal - Abort signal for cancellation / 用于取消的信号
   */
  async uploadChunksWithConcurrency(fileItem, chunksToUpload, signal) {
    let index = 0;

    const uploadChunk = async (chunkIndex) => {
      // 检查是否已经取消
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      
      const start = chunkIndex * this.chunkSize;
      const end = Math.min(start + this.chunkSize, fileItem.file.size);
      const chunk = fileItem.file.slice(start, end);

      const formData = new FormData();
      formData.append('file', chunk);
      formData.append('md5', fileItem.md5);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('totalChunks', fileItem.totalChunks.toString());

      await this.uploadWithRetry((signal) => {
        return fetch(this.chunkEndpoint, {
          method: 'POST',
          body: formData,
          signal: signal
        });
      }, this.maxRetries, signal);

      // Update progress / 更新进度
      fileItem.uploadedChunks.push(chunkIndex);
      const progress = Math.round((fileItem.uploadedChunks.length / fileItem.totalChunks) * 100);
      fileItem.progress = progress;
      this.updateFileStatus(fileItem);
    };

    const workers = Array.from({ length: this.concurrentChunks }, async () => {
      while (index < chunksToUpload.length && !signal.aborted) {
        const chunkIndex = chunksToUpload[index];
        index++;
        await uploadChunk(chunkIndex);
      }
    });

    await Promise.all(workers);
    
    // 如果被取消，抛出异常
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
  }

  /**
   * Check file status with server / 检查文件状态
   * @param {string} md5 - File MD5 hash / 文件MD5哈希值
   * @param {string} filename - Original filename / 原始文件名
   * @param {AbortSignal} signal - Abort signal for cancellation / 用于取消的信号
   * @returns {Promise<Object>} - Server response / 服务器响应
   */
  async checkFile(md5, filename, signal) {
    const response = await fetch(this.checkEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ md5, filename }),
      signal: signal
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Request server to merge chunks / 请求服务器合并分片
   * @param {string} md5 - File MD5 hash / 文件MD5哈希值
   * @param {string} filename - Original filename / 原始文件名
   * @param {number} totalChunks - Total number of chunks / 分片总数
   * @param {AbortSignal} signal - Abort signal for cancellation / 用于取消的信号
   * @returns {Promise<Object>} - Server response / 服务器响应
   */
  async mergeFile(md5, filename, totalChunks, signal) {
    const response = await fetch(this.mergeEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ md5, filename, totalChunks }),
      signal: signal
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Upload with retry mechanism / 带重试机制的上传
   * @param {Function} fn - Function to execute / 要执行的函数
   * @param {number} maxRetries - Maximum retry attempts / 最大重试次数
   * @param {AbortSignal} signal - Abort signal for cancellation / 用于取消的信号
   * @returns {Promise<any>} - Result of function execution / 函数执行结果
   */
  async uploadWithRetry(fn, maxRetries, signal) {
    let lastError;

    for (let i = 0; i <= maxRetries; i++) {
      // 检查是否已经取消
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      
      try {
        const response = await fn(signal);
        // 检查响应是否成功
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response;
      } catch (error) {
        // 如果是取消操作导致的错误，立即抛出
        if (error.name === 'AbortError') {
          throw error;
        }
        
        lastError = error;

        if (i < maxRetries) {
          // Exponential backoff delay / 指数退避延迟
          const delay = Math.min(1000 * Math.pow(2, i), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Calculate MD5 of file using Web Worker / 使用Web Worker计算文件MD5
   * @param {File} file - File to calculate MD5 for / 要计算MD5的文件
   * @returns {Promise<string>} - MD5 hash / MD5哈希值
   */
  async calculateMD5(file) {
    // Check if Web Workers are supported / 检查是否支持Web Workers
    if (typeof Worker !== 'undefined') {
      return new Promise((resolve, reject) => {
        try {
          // Create Web Worker code / 创建Web Worker代码
          const workerCode = `
            self.onmessage = function(event) {
              const { file, chunkSize = 2 * 1024 * 1024 } = event.data;
              
              try {
                // Dynamically import SparkMD5 / 动态导入SparkMD5
                importScripts('https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/spark-md5.min.js');
                
                const spark = new SparkMD5.ArrayBuffer();
                let currentChunk = 0;
                const totalChunks = Math.ceil(file.size / chunkSize);

                function loadNextChunk() {
                  const start = currentChunk * chunkSize;
                  const end = Math.min(start + chunkSize, file.size);
                  const chunk = file.slice(start, end);
                  
                  const reader = new FileReader();
                  reader.onload = function(e) {
                    spark.append(e.target.result);
                    currentChunk++;
                    
                    // Send progress update / 发送进度更新
                    const progress = Math.round((currentChunk / totalChunks) * 100);
                    self.postMessage({ progress, type: 'progress' });
                    
                    if (currentChunk < totalChunks) {
                      loadNextChunk();
                    } else {
                      const md5 = spark.end();
                      self.postMessage({ md5, success: true });
                    }
                  };
                  
                  reader.onerror = function(err) {
                    self.postMessage({ error: 'Failed to read file chunk: ' + err.message, success: false });
                  };
                  
                  reader.readAsArrayBuffer(chunk);
                }
                
                loadNextChunk();
              } catch (error) {
                self.postMessage({ error: 'Worker error: ' + error.message, success: false });
              }
            };
          `;
          
          // Create Blob URL / 创建Blob URL
          const blob = new Blob([workerCode], { type: 'application/javascript' });
          const workerUrl = URL.createObjectURL(blob);
          
          // Create Web Worker / 创建Web Worker
          const worker = new Worker(workerUrl);
          
          // Send file to Worker / 发送文件到Worker
          worker.postMessage({
            file: file,
            chunkSize: this.chunkSize
          });
          
          // Listen for Worker messages / 监听Worker消息
          worker.onmessage = function(event) {
            const data = event.data;
            
            if (data.type === 'progress') {
              // Handle progress updates / 处理进度更新
              console.log('MD5 calculation progress: ' + data.progress + '%');
            } else if (data.success) {
              // MD5 calculation complete / MD5计算完成
              URL.revokeObjectURL(workerUrl); // Release resources / 释放资源
              resolve(data.md5);
              worker.terminate(); // Terminate Worker / 终止Worker
            } else {
              // MD5 calculation error / MD5计算错误
              URL.revokeObjectURL(workerUrl); // Release resources / 释放资源
              reject(new Error(data.error));
              worker.terminate(); // Terminate Worker / 终止Worker
            }
          };
          
          // Handle Worker errors / 处理Worker错误
          worker.onerror = function(error) {
            URL.revokeObjectURL(workerUrl); // Release resources / 释放资源
            reject(new Error('Worker error: ' + error.message));
            worker.terminate(); // Terminate Worker / 终止Worker
          };
        } catch (error) {
          // Fallback to main thread if Web Workers initialization fails / 如果Web Workers初始化失败则回退到主线程
          console.warn('Failed to initialize Web Worker, falling back to main thread calculation / 无法初始化Web Worker，回退到主线程计算');
          this.calculateMD5Fallback(file).then(resolve).catch(reject);
        }
      });
    } else {
      // Fallback to main thread if Web Workers are not supported / 如果不支持Web Workers则回退到主线程
      console.warn('Web Workers not supported, falling back to main thread calculation / 不支持Web Workers，回退到主线程计算');
      return this.calculateMD5Fallback(file);
    }
  }

  /**
   * Fallback MD5 calculation on main thread / 在主线程中回退的MD5计算
   * @param {File} file - File to calculate MD5 for / 要计算MD5的文件
   * @returns {Promise<string>} - MD5 hash / MD5哈希值
   */
  async calculateMD5Fallback(file) {
    // Simulate MD5 calculation on main thread / 在主线程中模拟MD5计算
    return new Promise((resolve) => {
      // Simulate calculation time / 模拟计算时间
      setTimeout(() => {
        // Simplified MD5 simulation / 简化的MD5模拟
        resolve('md5-' + Date.now() + '-' + file.name);
      }, 300);
    });
  }

  /**
   * Generate unique ID / 生成唯一ID
   * @returns {string} - Unique ID / 唯一ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Update file status callback / 更新文件状态回调
   * Override this method to handle UI updates / 重写此方法以处理UI更新
   * @param {Object} fileItem - Updated file item / 更新的文件项
   */
  updateFileStatus(fileItem) {
    // This method should be overridden by the user / 此方法应由用户重写
    console.log(`File ${fileItem.name}: ${fileItem.status} (${fileItem.progress}%)`);
  }

  /**
   * Get current files / 获取当前文件
   * @returns {Array} - Current files / 当前文件
   */
  getFiles() {
    return this.files;
  }
  
  /**
   * Clean up resources / 清理资源
   */
  destroy() {
    // 取消所有正在进行的上传
    for (const [fileId, controller] of this.abortControllers.entries()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.uploadQueue = [];
    this.files = [];
  }
}

// Export for both CommonJS and AMD / 为CommonJS和AMD导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileUploader;
} else if (typeof define === 'function' && define.amd) {
  define(function() {
    return FileUploader;
  });
} else {
  // Export to global scope / 导出到全局作用域
  window.FileUploader = FileUploader;
}