#!/bin/bash
# generate_streams.sh

# Create the streams directory
mkdir -p ../backend/data/streams/sample-stream

# Input video file (put your video here)
INPUT_VIDEO="../backend/data/streams/test-video-2.mp4"

# Check if input video exists
if [ ! -f "$INPUT_VIDEO" ]; then
    echo "❌ Video file not found: $INPUT_VIDEO"
    #echo "Please put a video file named 'your_video.mp4' in this directory"
    exit 1
fi

echo "🎬 Generating HLS stream from $INPUT_VIDEO..."

# Generate HLS stream with 10-second segments
ffmpeg -i "$INPUT_VIDEO" \
  -c:v libx264 \
  -c:a aac \
  -strict -2 \
  -f hls \
  -hls_time 10 \
  -hls_list_size 0 \
  -hls_segment_type mpegts \
  -hls_segment_filename "../backend/data/streams/sample-stream/segment%03d.ts" \
  "../backend/data/streams/sample-stream/playlist.m3u8"

echo "✅ HLS stream generated successfully!"
echo "📁 Files created in: ../backend/data/streams/sample-stream/"
echo "📋 Playlist: ../backend/data/streams/sample-stream/playlist.m3u8"

# List generated files
echo ""
echo "📄 Generated files:"
ls -la ../backend/data/streams/sample-stream/