/**
 * Large File Upload SDK / 大文件上传SDK
 * Supports chunked upload, resumable upload, and instant transfer / 支持分片上传、断点续传和秒传
 */
interface FileUploaderOptions {
    checkEndpoint: string;
    chunkEndpoint: string;
    mergeEndpoint: string;
    chunkSize?: number;
    concurrentFiles?: number;
    concurrentChunks?: number;
    maxRetries?: number;
}
interface FileItem {
    id: string;
    file: File;
    status: 'pending' | 'checking' | 'uploading' | 'merging' | 'success' | 'error' | 'cancelled';
    progress: number;
    name: string;
    size: number;
    uploadedChunks: number[];
    totalChunks: number;
    md5?: string;
    error?: string;
}
declare class FileUploader {
    private checkEndpoint;
    private chunkEndpoint;
    private mergeEndpoint;
    private chunkSize;
    private concurrentFiles;
    private concurrentChunks;
    private maxRetries;
    private uploadQueue;
    private uploadingCount;
    private files;
    private abortControllers;
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
    constructor(options: FileUploaderOptions);
    /**
     * Add files to upload queue / 将文件添加到上传队列
     * @param {FileList|File[]} fileList - Files to upload / 要上传的文件
     */
    addFiles(fileList: FileList | File[]): FileItem[];
    /**
     * Cancel file upload / 取消文件上传
     * @param {string} fileId - ID of the file to cancel / 要取消的文件ID
     */
    cancelUpload(fileId: string): void;
    /**
     * Process upload queue / 处理上传队列
     */
    private processQueue;
    /**
     * Process individual file / 处理单个文件
     * @param {Object} fileItem - File item to process / 要处理的文件项
     */
    private processFile;
    /**
     * Upload chunks with concurrency control / 并发控制上传分片
     * @param {Object} fileItem - File item being uploaded / 正在上传的文件项
     * @param {number[]} chunksToUpload - Indices of chunks to upload / 要上传的分片索引
     * @param {AbortSignal} signal - Abort signal for cancellation / 用于取消的信号
     */
    private uploadChunksWithConcurrency;
    /**
     * Check file status with server / 检查文件状态
     * @param {string} md5 - File MD5 hash / 文件MD5哈希值
     * @param {string} filename - Original filename / 原始文件名
     * @param {AbortSignal} signal - Abort signal for cancellation / 用于取消的信号
     * @returns {Promise<Object>} - Server response / 服务器响应
     */
    private checkFile;
    /**
     * Request server to merge chunks / 请求服务器合并分片
     * @param {string} md5 - File MD5 hash / 文件MD5哈希值
     * @param {string} filename - Original filename / 原始文件名
     * @param {number} totalChunks - Total number of chunks / 分片总数
     * @param {AbortSignal} signal - Abort signal for cancellation / 用于取消的信号
     * @returns {Promise<Object>} - Server response / 服务器响应
     */
    private mergeFile;
    /**
     * Upload with retry mechanism / 带重试机制的上传
     * @param {Function} fn - Function to execute / 要执行的函数
     * @param {number} maxRetries - Maximum retry attempts / 最大重试次数
     * @param {AbortSignal} signal - Abort signal for cancellation / 用于取消的信号
     * @returns {Promise<any>} - Result of function execution / 函数执行结果
     */
    private uploadWithRetry;
    /**
     * Calculate MD5 of file using Web Worker / 使用Web Worker计算文件MD5
     * @param {File} file - File to calculate MD5 for / 要计算MD5的文件
     * @returns {Promise<string>} - MD5 hash / MD5哈希值
     */
    private calculateMD5;
    /**
     * Fallback MD5 calculation on main thread / 在主线程中回退的MD5计算
     * @param {File} file - File to calculate MD5 for / 要计算MD5的文件
     * @returns {Promise<string>} - MD5 hash / MD5哈希值
     */
    private calculateMD5Fallback;
    /**
     * Generate unique ID / 生成唯一ID
     * @returns {string} - Unique ID / 唯一ID
     */
    private generateId;
    /**
     * Update file status callback / 更新文件状态回调
     * Override this method to handle UI updates / 重写此方法以处理UI更新
     * @param {Object} fileItem - Updated file item / 更新的文件项
     */
    updateFileStatus(fileItem: FileItem): void;
    /**
     * Get current files / 获取当前文件
     * @returns {Array} - Current files / 当前文件
     */
    getFiles(): FileItem[];
    /**
     * Clean up resources / 清理资源
     */
    destroy(): void;
}
export default FileUploader;
