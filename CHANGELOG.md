# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-12-18

### Changed

- Removed checkEndpoint, chunkEndpoint, and mergeEndpoint configuration options
- Added customizable functions: checkFileFunction, uploadChunkFunction, and mergeFileFunction
- Made custom functions required (no default implementations)
- Updated documentation to reflect new API
- Updated demo application to use new API

### Added

- Support for custom implementation of file checking, chunk uploading, and file merging functions

## [1.0.0] - 2025-12-17

### Added

- Initial release of the Large File Upload SDK
- Support for chunked uploads
- Resumable upload capability
- Instant transfer functionality
- Concurrency control for files and chunks
- Progress tracking
- Error retry mechanism with exponential backoff
- Web Worker optimization for MD5 calculation
- Cancel upload functionality
- Resource cleanup methods
- Comprehensive documentation
- Demo application
- NPM package configuration

### Changed

- Improved error handling for HTTP requests
- Enhanced UI for the demo application
- Optimized memory management
- Better resource cleanup on cancellation

### Fixed

- Various bug fixes and performance improvements