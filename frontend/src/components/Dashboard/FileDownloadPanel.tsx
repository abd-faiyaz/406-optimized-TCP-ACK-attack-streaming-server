import { useState } from 'react';
import { DocumentArrowDownIcon } from '@heroicons/react/24/outline';

interface FileDownloadPanelProps {
  isServerRunning: boolean;
}

interface ChunkProgress {
  chunkIndex: number;
  start: number;
  end: number;
  downloaded: number;
  speed: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
}

function FileDownloadPanel({ isServerRunning }: FileDownloadPanelProps) {
  const [selectedFile, setSelectedFile] = useState('xl.dat');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [useChunkedDownload, setUseChunkedDownload] = useState(true);
  const [chunkSize] = useState(65536); // 64KB default
  const [chunksProgress, setChunksProgress] = useState<ChunkProgress[]>([]);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [hasProgressToShow, setHasProgressToShow] = useState(false);

  const testFiles = [
    { name: 'small-file.txt', size: '10 MB', description: 'Small test file' },
    { name: 'sample-document.txt', size: '100 MB', description: 'Medium test file' },
    { name: 'xl.dat', size: '500 MB', description: 'Large test file (recommended for chunked download)' }
  ];

  const getFileSize = async (filename: string): Promise<number> => {
    const response = await fetch(`http://localhost:3001/download/${filename}`, {
      method: 'HEAD'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get file size: ${response.statusText}`);
    }
    
    return parseInt(response.headers.get('content-length') || '0');
  };

  const downloadChunk = async (
    filename: string, 
    start: number, 
    end: number, 
    chunkIndex: number
  ): Promise<ArrayBuffer> => {
    const response = await fetch(`http://localhost:3001/download/${filename}`, {
      headers: {
        'Range': `bytes=${start}-${end}`,
        'Connection': 'keep-alive',
        'User-Agent': 'Optimistic-ACK-Frontend/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Chunk download failed: ${response.statusText}`);
    }

    console.log(`📡 Chunk ${chunkIndex} response: ${response.status} ${response.statusText}`);
    console.log(`📊 Content-Range: ${response.headers.get('content-range')}`);
    console.log(`📏 Content-Length: ${response.headers.get('content-length')}`);

    // Track chunk progress
    const chunkStartTime = Date.now();
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        // Update chunk progress
        const elapsed = (Date.now() - chunkStartTime) / 1000;
        const speed = elapsed > 0 ? receivedLength / elapsed : 0;
        
        setChunksProgress(prev => prev.map(chunk => 
          chunk.chunkIndex === chunkIndex 
            ? { ...chunk, downloaded: receivedLength, speed, status: 'downloading' as const }
            : chunk
        ));
      }
    }

    // Combine chunks into single ArrayBuffer
    const fullChunk = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      fullChunk.set(chunk, position);
      position += chunk.length;
    }

    console.log(`✅ Chunk ${chunkIndex} completed: ${formatBytes(receivedLength)}`);
    
    // Mark chunk as complete
    setChunksProgress(prev => prev.map(chunk => 
      chunk.chunkIndex === chunkIndex 
        ? { ...chunk, downloaded: receivedLength, status: 'complete' as const }
        : chunk
    ));

    return fullChunk.buffer;
  };

  const performChunkedDownload = async (filename: string): Promise<void> => {
    console.log('🔄 Starting chunked download...');
    
    // Get file size first
    const fileSize = await getFileSize(filename);
    setTotalBytes(fileSize);
    
    console.log(`📦 File size: ${formatBytes(fileSize)}, Chunk size: ${formatBytes(chunkSize)}`);
    
    // Calculate chunks
    const numChunks = Math.ceil(fileSize / chunkSize);
    const chunks: ChunkProgress[] = [];
    
    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, fileSize - 1);
      
      chunks.push({
        chunkIndex: i,
        start,
        end,
        downloaded: 0,
        speed: 0,
        status: 'pending'
      });
    }
    
    setChunksProgress(chunks);
    
    const downloadStartTime = Date.now();
    const downloadedChunks: ArrayBuffer[] = new Array(numChunks);
    let completedBytes = 0;
    
    // Download chunks sequentially (simulating the attack pattern)
    for (let i = 0; i < numChunks; i++) {
      const chunk = chunks[i];
      
      try {
        console.log(`📥 Downloading chunk ${i + 1}/${numChunks}: bytes ${chunk.start}-${chunk.end}`);
        
        // Mark chunk as downloading
        setChunksProgress(prev => prev.map(c => 
          c.chunkIndex === i ? { ...c, status: 'downloading' as const } : c
        ));
        
        const chunkData = await downloadChunk(filename, chunk.start, chunk.end, i);
        downloadedChunks[i] = chunkData;
        
        completedBytes += chunkData.byteLength;
        
        // Update overall progress
        const progress = (completedBytes / fileSize) * 100;
        setDownloadProgress(progress);
        
        // Update overall speed
        const elapsed = (Date.now() - downloadStartTime) / 1000;
        const currentSpeed = elapsed > 0 ? completedBytes / elapsed : 0;
        setDownloadSpeed(currentSpeed);
        
        console.log(`📊 Overall progress: ${progress.toFixed(1)}% (${formatBytes(completedBytes)}/${formatBytes(fileSize)})`);
        
        // Small delay to coordinate with potential optimistic ACK attack
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.error(`❌ Chunk ${i} failed:`, error);
        setChunksProgress(prev => prev.map(c => 
          c.chunkIndex === i ? { ...c, status: 'error' as const } : c
        ));
        throw error;
      }
    }
    
    // Combine all chunks into final blob
    console.log('🔗 Combining chunks into final file...');
    const finalData = new Uint8Array(fileSize);
    let offset = 0;
    
    for (const chunkData of downloadedChunks) {
      const chunkArray = new Uint8Array(chunkData);
      finalData.set(chunkArray, offset);
      offset += chunkArray.length;
    }
    
    // Create download
    const blob = new Blob([finalData]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log(`✅ Chunked download completed: ${formatBytes(fileSize)}`);
  };

  const performSimpleDownload = async (filename: string): Promise<void> => {
    console.log('📦 Starting simple download...');
    
    const response = await fetch(`http://localhost:3001/download/${filename}`);
    if (!response.ok) throw new Error('Download failed');

    const reader = response.body?.getReader();
    const contentLength = parseInt(response.headers.get('Content-Length') || '0');
    setTotalBytes(contentLength);
    
    let receivedLength = 0;
    const startTime = Date.now();

    if (reader) {
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;
        
        const progress = (receivedLength / contentLength) * 100;
        setDownloadProgress(progress);
        
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? receivedLength / elapsed : 0;
        setDownloadSpeed(speed);
      }

      // Create blob and download
      const blob = new Blob(chunks);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    
    console.log(`✅ Simple download completed: ${formatBytes(receivedLength)}`);
  };

  const handleDownload = async () => {
    if (!isServerRunning) {
      alert('Server must be running to download files');
      return;
    }

    setIsDownloading(true);
    setDownloadComplete(false);
    setHasProgressToShow(true);
    setDownloadProgress(0);
    setDownloadSpeed(0);
    setChunksProgress([]);

    try {
      if (useChunkedDownload) {
        await performChunkedDownload(selectedFile);
      } else {
        await performSimpleDownload(selectedFile);
      }
      
      // Mark as complete but keep showing progress
      setDownloadComplete(true);
      console.log('📊 Download completed, keeping progress visible');
      
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsDownloading(false); // Stop the downloading state but keep progress visible
    }
  };

  const handleClearProgress = () => {
    setDownloadProgress(0);
    setDownloadSpeed(0);
    setTotalBytes(0);
    setChunksProgress([]);
    setDownloadComplete(false);
    setHasProgressToShow(false);
    console.log('🧹 Download progress cleared');
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <DocumentArrowDownIcon className="h-5 w-5 mr-2 text-gray-400" />
          File Download
        </h2>
      </div>

      <div className="p-6 space-y-4">
        {/* Download Method Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Download Method
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="downloadMethod"
                checked={useChunkedDownload}
                onChange={() => setUseChunkedDownload(true)}
                disabled={isDownloading}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">
                  🔗 Chunked Download (Range Requests)
                </div>
                <div className="text-xs text-gray-500">
                  Simulates optimistic ACK attack pattern - Downloads file in chunks using HTTP Range requests
                </div>
              </div>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="downloadMethod"
                checked={!useChunkedDownload}
                onChange={() => setUseChunkedDownload(false)}
                disabled={isDownloading}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">📦 Simple Download</div>
                <div className="text-xs text-gray-500">Standard single-request download</div>
              </div>
            </label>
          </div>
        </div>

        {/* Chunk Size Configuration */}
        {/* {useChunkedDownload && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Chunk Size
            </label>
            <select
              value={chunkSize}
              onChange={(e) => setChunkSize(parseInt(e.target.value))}
              disabled={isDownloading}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value={32768}>32 KB (Small chunks)</option>
              <option value={65536}>64 KB (Default)</option>
              <option value={131072}>128 KB (Medium chunks)</option>
              <option value={262144}>256 KB (Large chunks)</option>
              <option value={524288}>512 KB (Very large chunks)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Smaller chunks = more range requests (better for demonstrating attack)
            </p>
          </div>
        )} */}

        {/* File Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Test File
          </label>
          <div className="space-y-2">
            {testFiles.map((file) => (
              <label key={file.name} className="flex items-center">
                <input
                  type="radio"
                  name="testFile"
                  value={file.name}
                  checked={selectedFile === file.name}
                  onChange={(e) => setSelectedFile(e.target.value)}
                  disabled={isDownloading}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900">{file.name}</div>
                  <div className="text-xs text-gray-500">{file.size} - {file.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Download Progress - Show during download AND after completion */}
        {hasProgressToShow && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {useChunkedDownload ? 'Chunked Download Progress' : 'Download Progress'}
                </span>
                {downloadComplete && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium">
                    ✓ COMPLETE
                  </span>
                )}
                {isDownloading && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                    <span className="animate-pulse">●</span> DOWNLOADING
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-900">{Math.round(downloadProgress)}%</span>
                <button
                  onClick={handleClearProgress}
                  className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                  title="Clear progress and stats"
                >
                  Clear
                </button>
              </div>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ease-out ${
                  downloadComplete ? 'bg-green-600' : 'bg-blue-600'
                }`}
                style={{ width: `${downloadProgress}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                Speed: {formatSpeed(downloadSpeed)}
                {downloadComplete && <span className="text-green-600 ml-1">(Final)</span>}
              </span>
              <span>
                {totalBytes > 0 && `${formatBytes(totalBytes * downloadProgress / 100)} / ${formatBytes(totalBytes)}`}
              </span>
            </div>
          </div>
        )}

        {/* Chunk Progress Details - Show during download AND after completion */}
        {hasProgressToShow && useChunkedDownload && chunksProgress.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">Chunk Progress</h4>
              {downloadComplete && (
                <span className="text-xs text-green-600 font-medium">All chunks complete</span>
              )}
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {chunksProgress.slice(0, 10).map((chunk) => (
                <div key={chunk.chunkIndex} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">
                    Chunk {chunk.chunkIndex + 1} ({formatBytes(chunk.start)}-{formatBytes(chunk.end)})
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      chunk.status === 'complete' ? 'bg-green-100 text-green-700' :
                      chunk.status === 'downloading' ? 'bg-blue-100 text-blue-700' :
                      chunk.status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {chunk.status === 'complete' ? '✓' :
                       chunk.status === 'downloading' ? '⬇' :
                       chunk.status === 'error' ? '✗' : '⏳'}
                    </span>
                    {chunk.speed > 0 && (
                      <span className="text-gray-500">{formatSpeed(chunk.speed)}</span>
                    )}
                  </div>
                </div>
              ))}
              {chunksProgress.length > 10 && (
                <div className="text-xs text-gray-500 text-center">
                  ... and {chunksProgress.length - 10} more chunks
                </div>
              )}
            </div>
          </div>
        )}

        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={!isServerRunning || isDownloading}
          className={`w-full flex items-center justify-center px-4 py-2 rounded-md font-medium transition-colors duration-200 ${
            isServerRunning && !isDownloading
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <DocumentArrowDownIcon className="h-5 w-5 mr-2" />
          {isDownloading 
            ? (useChunkedDownload ? 'Downloading Chunks...' : 'Downloading...') 
            : (useChunkedDownload ? 'Start Chunked Download' : 'Start Download')
          }
        </button>

        {!isServerRunning && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              Start the server to enable file downloads
            </p>
          </div>
        )}

        {/* {useChunkedDownload && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <p className="text-sm text-yellow-800">
              💡 <strong>Tip:</strong> Chunked downloads use the same pattern as the optimistic ACK attack. 
              Monitor the Network Performance panel to see how range requests affect transfer speed.
            </p>
          </div>
        )} */}

        {downloadComplete && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-sm text-green-800">
              ✅ <strong>Download Complete!</strong> Progress and stats are preserved above. 
              Use the "Clear" button to reset for a new download.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileDownloadPanel;
