'use client';

import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AspectRatio = '1:1' | '4:5';
type TemplateType = '4-grid' | 'header-single' | 'header-4-images';

interface ImageTransform {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export default function VideoCreator() {
  const [templateType, setTemplateType] = useState<TemplateType>('4-grid');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [mainCaption, setMainCaption] = useState('');
  const [headerText, setHeaderText] = useState('');
  const [fontSize, setFontSize] = useState(60);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [images, setImages] = useState<(string | null)[]>([null, null, null, null]);
  const [imageLabels, setImageLabels] = useState<string[]>(['', '', '', '']);
  const [imageTransforms, setImageTransforms] = useState<ImageTransform[]>([
    { zoom: 1, offsetX: 0, offsetY: 0 },
    { zoom: 1, offsetX: 0, offsetY: 0 },
    { zoom: 1, offsetX: 0, offsetY: 0 },
    { zoom: 1, offsetX: 0, offsetY: 0 },
  ]);

  // Get number of images needed based on template
  const getImageCount = () => {
    switch (templateType) {
      case '4-grid': return 4;
      case 'header-single': return 1;
      case 'header-4-images': return 4;
      default: return 4;
    }
  };
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);
  const loadedImagesRef = useRef<(HTMLImageElement | null)[]>([null, null, null, null]);
  const loadedVideoRef = useRef<HTMLVideoElement | null>(null);
  const loadedVideosRef = useRef<(HTMLVideoElement | null)[]>([null, null, null, null]);
  const [isVideo, setIsVideo] = useState(false);
  const [isVideoArray, setIsVideoArray] = useState<boolean[]>([false, false, false, false]);
  const [keepVideoAudio, setKeepVideoAudio] = useState(false);

  // Canvas dimensions based on aspect ratio (fixed size)
  const canvasDimensions = aspectRatio === '1:1'
    ? { width: 1080, height: 1080 }
    : { width: 1080, height: 1350 }; // 4:5

  // Load FFmpeg
  useEffect(() => {
    loadFFmpeg();
  }, []);

  // Reset video states when template changes
  useEffect(() => {
    // Clear video refs
    loadedVideoRef.current = null;
    loadedVideosRef.current = [null, null, null, null];

    // Reset video state flags
    setIsVideo(false);
    setIsVideoArray([false, false, false, false]);
  }, [templateType]);

  // Note: keepVideoAudio is only used during video generation, not for preview playback

  const loadFFmpeg = async () => {
    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    ffmpeg.on('log', ({ message }) => {
      console.log(message);
    });

    ffmpeg.on('progress', ({ progress }) => {
      setProgress(`Rendering: ${Math.round(progress * 100)}%`);
    });

    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setFfmpegLoaded(true);
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
    }
  };

  // Handle image upload
  const handleImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newImages = [...images];
        newImages[index] = event.target?.result as string;
        setImages(newImages);

        // Reset transform for new image
        const newTransforms = [...imageTransforms];
        newTransforms[index] = { zoom: 1, offsetX: 0, offsetY: 0 };
        setImageTransforms(newTransforms);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMusicFile(file);
    }
  };

  const triggerUploadImages = () => {
    fileInputRefs.current[0]?.click();
  };

  // Handle preview canvas click to select image
  const handlePreviewClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (templateType === '4-grid') {
      const gridWidth = canvas.width / 2;
      const gridHeight = canvas.height / 2;
      const col = Math.floor(x / gridWidth);
      const row = Math.floor(y / gridHeight);
      const index = row * 2 + col;
      if (index >= 0 && index < 4 && images[index]) {
        setSelectedImageIndex(index);
      }
    } else if (templateType === 'header-single') {
      // Calculate dynamic header height
      const ctx = canvas.getContext('2d');
      let headerHeight = 150;
      if (ctx && headerText) {
        ctx.font = `bold ${fontSize}px ${fontFamily}`;
        const lines = wrapText(ctx, headerText, canvas.width - 40);
        const lineHeight = fontSize * 1.2;
        headerHeight = Math.max(150, (lines.length * lineHeight) + 60);
      }
      if (y > headerHeight && images[0]) {
        setSelectedImageIndex(0);
      }
    } else if (templateType === 'header-4-images') {
      // Calculate dynamic header height
      const ctx = canvas.getContext('2d');
      let headerHeight = 150;
      if (ctx && headerText) {
        ctx.font = `bold ${fontSize}px ${fontFamily}`;
        const lines = wrapText(ctx, headerText, canvas.width - 40);
        const lineHeight = fontSize * 1.2;
        headerHeight = Math.max(150, (lines.length * lineHeight) + 60);
      }
      if (y > headerHeight) {
        const availableHeight = canvas.height - headerHeight;
        const gridWidth = canvas.width / 2;
        const gridHeight = availableHeight / 2;

        const col = Math.floor(x / gridWidth);
        const row = Math.floor((y - headerHeight) / gridHeight);
        const index = row * 2 + col;

        if (index >= 0 && index < 4 && images[index]) {
          setSelectedImageIndex(index);
        }
      }
    }
  };

  // Handle zoom change
  const handleZoomChange = (zoom: number) => {
    if (selectedImageIndex === null) return;
    const newTransforms = [...imageTransforms];
    const transform = newTransforms[selectedImageIndex];
    transform.zoom = zoom;

    // Constrain offsets when zoom changes to prevent white background
    const img = loadedImagesRef.current[selectedImageIndex];
    if (img) {
      let cellWidth, cellHeight;

      // Calculate dynamic header height for header templates
      let headerHeight = 150;
      if ((templateType === 'header-single' || templateType === 'header-4-images') && headerText) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = `bold ${fontSize}px ${fontFamily}`;
          const lines = wrapText(ctx, headerText, canvasDimensions.width - 40);
          const lineHeight = fontSize * 1.2;
          headerHeight = Math.max(150, (lines.length * lineHeight) + 60);
        }
      }

      if (templateType === '4-grid') {
        cellWidth = canvasDimensions.width / 2;
        cellHeight = canvasDimensions.height / 2;
      } else if (templateType === 'header-single') {
        cellWidth = canvasDimensions.width;
        cellHeight = canvasDimensions.height - headerHeight;
      } else if (templateType === 'header-4-images') {
        const availableHeight = canvasDimensions.height - headerHeight;
        cellWidth = canvasDimensions.width / 2;
        cellHeight = availableHeight / 2;
      } else {
        cellWidth = canvasDimensions.width / 2;
        cellHeight = canvasDimensions.height / 2;
      }

      // Calculate aspect ratios
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const cellAspect = cellWidth / cellHeight;

      // Calculate base dimensions
      let baseWidth, baseHeight;
      if (imgAspect > cellAspect) {
        baseHeight = cellHeight;
        baseWidth = baseHeight * imgAspect;
      } else {
        baseWidth = cellWidth;
        baseHeight = baseWidth / imgAspect;
      }

      // Apply zoom
      const scaledWidth = baseWidth * zoom;
      const scaledHeight = baseHeight * zoom;

      // Calculate max offsets
      const maxOffsetX = (scaledWidth - cellWidth) / 2;
      const maxOffsetY = (scaledHeight - cellHeight) / 2;

      // Constrain current offsets
      transform.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, transform.offsetX));
      transform.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, transform.offsetY));
    }

    setImageTransforms(newTransforms);
  };

  // Handle drag start on preview
  const handlePreviewDragStart = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedImageIndex === null || !images[selectedImageIndex]) return;
    e.preventDefault();
    setDraggingIndex(selectedImageIndex);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  // Handle drag move
  const handleDragMove = (e: React.MouseEvent) => {
    if (draggingIndex === null || !dragStart) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    const newTransforms = [...imageTransforms];
    const transform = newTransforms[draggingIndex];

    // Calculate new offsets
    let newOffsetX = transform.offsetX + deltaX;
    let newOffsetY = transform.offsetY + deltaY;

    // Get the loaded image to calculate bounds
    const img = loadedImagesRef.current[draggingIndex];
    if (img) {
      let cellWidth, cellHeight;

      // Calculate dynamic header height for header templates
      let headerHeight = 150;
      if ((templateType === 'header-single' || templateType === 'header-4-images') && headerText) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = `bold ${fontSize}px ${fontFamily}`;
          const lines = wrapText(ctx, headerText, canvasDimensions.width - 40);
          const lineHeight = fontSize * 1.2;
          headerHeight = Math.max(150, (lines.length * lineHeight) + 60);
        }
      }

      if (templateType === '4-grid') {
        cellWidth = canvasDimensions.width / 2;
        cellHeight = canvasDimensions.height / 2;
      } else if (templateType === 'header-single') {
        cellWidth = canvasDimensions.width;
        cellHeight = canvasDimensions.height - headerHeight;
      } else if (templateType === 'header-4-images') {
        const availableHeight = canvasDimensions.height - headerHeight;
        cellWidth = canvasDimensions.width / 2;
        cellHeight = availableHeight / 2;
      } else {
        cellWidth = canvasDimensions.width / 2;
        cellHeight = canvasDimensions.height / 2;
      }

      // Calculate aspect ratios
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const cellAspect = cellWidth / cellHeight;

      // Calculate base dimensions
      let baseWidth, baseHeight;
      if (imgAspect > cellAspect) {
        baseHeight = cellHeight;
        baseWidth = baseHeight * imgAspect;
      } else {
        baseWidth = cellWidth;
        baseHeight = baseWidth / imgAspect;
      }

      // Apply zoom
      const scaledWidth = baseWidth * transform.zoom;
      const scaledHeight = baseHeight * transform.zoom;

      // Calculate max offsets to prevent white background from showing
      const maxOffsetX = (scaledWidth - cellWidth) / 2;
      const maxOffsetY = (scaledHeight - cellHeight) / 2;

      // Constrain offsets
      newOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newOffsetX));
      newOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newOffsetY));
    }

    transform.offsetX = newOffsetX;
    transform.offsetY = newOffsetY;
    setImageTransforms(newTransforms);

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragStart(null);
  };

  // Utility function to wrap text
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  };

  // Draw canvas preview
  useEffect(() => {
    drawCanvas(previewCanvasRef.current, true);
    drawCanvas(canvasRef.current, false);
  }, [images, imageTransforms, mainCaption, aspectRatio, selectedImageIndex, fontSize, fontFamily, templateType, headerText, imageLabels]);


  const drawCanvas = (canvas: HTMLCanvasElement | null, showHighlight: boolean, opacity: number = 1) => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with background color (black for header templates, white for 4-grid)
    ctx.fillStyle = (templateType === 'header-4-images' || templateType === 'header-single') ? '#000000' : '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (templateType === '4-grid') {
      draw4GridTemplate(canvas, ctx, showHighlight);
    } else if (templateType === 'header-single') {
      drawHeaderSingleTemplate(canvas, ctx, showHighlight, opacity);
    } else if (templateType === 'header-4-images') {
      drawHeader4ImagesTemplate(canvas, ctx, showHighlight, opacity);
    }
  };

  const draw4GridTemplate = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, showHighlight: boolean) => {
    // Draw 4 images in grid
    const gridWidth = canvas.width / 2;
    const gridHeight = canvas.height / 2;

    let imagesToLoad = 0;
    let imagesLoaded = 0;

    images.forEach((imgSrc, index) => {
      if (imgSrc) {
        imagesToLoad++;

        const drawMediaWithTransform = (media: HTMLImageElement | HTMLVideoElement) => {
          const x = (index % 2) * gridWidth;
          const y = Math.floor(index / 2) * gridHeight;

          const transform = imageTransforms[index];

          // Save context
          ctx.save();

          // Create clipping region for this grid cell
          ctx.beginPath();
          ctx.rect(x, y, gridWidth, gridHeight);
          ctx.clip();

          // Calculate aspect ratios
          const mediaAspect = media instanceof HTMLVideoElement
            ? media.videoWidth / media.videoHeight
            : media.naturalWidth / media.naturalHeight;
          const cellAspect = gridWidth / gridHeight;

          // Calculate base dimensions to cover the cell while maintaining aspect ratio
          let baseWidth, baseHeight;
          if (mediaAspect > cellAspect) {
            // Media is wider than cell - fit to height
            baseHeight = gridHeight;
            baseWidth = baseHeight * mediaAspect;
          } else {
            // Media is taller than cell - fit to width
            baseWidth = gridWidth;
            baseHeight = baseWidth / mediaAspect;
          }

          // Apply zoom to the base dimensions
          const scaledWidth = baseWidth * transform.zoom;
          const scaledHeight = baseHeight * transform.zoom;

          // Calculate center position
          const centerX = x + gridWidth / 2;
          const centerY = y + gridHeight / 2;

          // Apply transformations and draw
          const drawX = centerX - scaledWidth / 2 + transform.offsetX;
          const drawY = centerY - scaledHeight / 2 + transform.offsetY;

          ctx.drawImage(media, drawX, drawY, scaledWidth, scaledHeight);

          // Restore context
          ctx.restore();

          // Draw highlight border if this media is selected
          if (showHighlight && selectedImageIndex === index) {
            ctx.strokeStyle = '#3B82F6';
            ctx.lineWidth = 6;
            ctx.strokeRect(x + 3, y + 3, gridWidth - 6, gridHeight - 6);
          }

          imagesLoaded++;
          if (imagesLoaded === imagesToLoad) {
            drawMainCaption(ctx, canvas);
          }
        };

        // Handle image
        if (loadedImagesRef.current[index] && loadedImagesRef.current[index]!.src === imgSrc) {
          drawMediaWithTransform(loadedImagesRef.current[index]!);
        } else {
          // Load new image
          const img = new Image();
          img.src = imgSrc;
          img.onload = () => {
            loadedImagesRef.current[index] = img;
            drawMediaWithTransform(img);
          };
        }
      } else {
        loadedImagesRef.current[index] = null;
      }
    });

    if (imagesToLoad === 0) {
      drawMainCaption(ctx, canvas);
    }
  };

  const drawHeaderSingleTemplate = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, showHighlight: boolean, opacity: number = 1) => {
    // Calculate dynamic header height based on text
    let headerHeight = 150;
    if (headerText) {
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      const lines = wrapText(ctx, headerText, canvas.width - 40);
      const lineHeight = fontSize * 1.2;
      headerHeight = Math.max(150, (lines.length * lineHeight) + 60);
    }

    const imageY = headerHeight;
    const imageHeight = canvas.height - headerHeight;

    // Draw white background for header area
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, headerHeight);

    // Draw header text (no fade-in)
    if (headerText) {
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lines = wrapText(ctx, headerText, canvas.width - 40);
      const lineHeight = fontSize * 1.2;
      const totalHeight = lines.length * lineHeight;
      const startY = (headerHeight - totalHeight) / 2 + lineHeight / 2;

      lines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, startY + (index * lineHeight));
      });
    }

    // Draw single image/video with opacity
    const imgSrc = images[0];
    if (imgSrc) {
      const drawMediaWithTransform = (media: HTMLImageElement | HTMLVideoElement) => {
        const transform = imageTransforms[0];

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.rect(0, imageY, canvas.width, imageHeight);
        ctx.clip();

        const mediaAspect = media instanceof HTMLVideoElement
          ? media.videoWidth / media.videoHeight
          : media.naturalWidth / media.naturalHeight;
        const areaAspect = canvas.width / imageHeight;

        let baseWidth, baseHeight;
        if (mediaAspect > areaAspect) {
          baseHeight = imageHeight;
          baseWidth = baseHeight * mediaAspect;
        } else {
          baseWidth = canvas.width;
          baseHeight = baseWidth / mediaAspect;
        }

        const scaledWidth = baseWidth * transform.zoom;
        const scaledHeight = baseHeight * transform.zoom;

        const centerX = canvas.width / 2;
        const centerY = imageY + imageHeight / 2;

        const drawX = centerX - scaledWidth / 2 + transform.offsetX;
        const drawY = centerY - scaledHeight / 2 + transform.offsetY;

        ctx.drawImage(media, drawX, drawY, scaledWidth, scaledHeight);
        ctx.restore();

        if (showHighlight && selectedImageIndex === 0) {
          ctx.strokeStyle = '#3B82F6';
          ctx.lineWidth = 6;
          ctx.strokeRect(3, imageY + 3, canvas.width - 6, imageHeight - 6);
        }
      };

      // Handle image
      if (loadedImagesRef.current[0] && loadedImagesRef.current[0]!.src === imgSrc) {
        drawMediaWithTransform(loadedImagesRef.current[0]!);
      } else {
        const img = new Image();
        img.src = imgSrc;
        img.onload = () => {
          loadedImagesRef.current[0] = img;
          drawMediaWithTransform(img);
        };
      }
    }
  };

  const drawHeader4ImagesTemplate = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, showHighlight: boolean, opacity: number = 1) => {
    // Calculate dynamic header height based on text
    let headerHeight = 150;
    if (headerText) {
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      const lines = wrapText(ctx, headerText, canvas.width - 40);
      const lineHeight = fontSize * 1.2;
      headerHeight = Math.max(150, (lines.length * lineHeight) + 60);
    }

    const imageY = headerHeight;
    const availableHeight = canvas.height - headerHeight;
    const gridWidth = canvas.width / 2;
    const gridHeight = availableHeight / 2;

    // Draw white background for header area
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, headerHeight);

    // Draw header text (no fade-in)
    if (headerText) {
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lines = wrapText(ctx, headerText, canvas.width - 40);
      const lineHeight = fontSize * 1.2;
      const totalHeight = lines.length * lineHeight;
      const startY = (headerHeight - totalHeight) / 2 + lineHeight / 2;

      lines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, startY + (index * lineHeight));
      });
    }

    // Draw 4 images in 2x2 grid
    let imagesToLoad = 0;
    let imagesLoaded = 0;

    images.forEach((imgSrc, index) => {
      if (imgSrc) {
        imagesToLoad++;

        const drawMediaWithTransform = (media: HTMLImageElement | HTMLVideoElement) => {
          const col = index % 2;
          const row = Math.floor(index / 2);
          const x = col * gridWidth;
          const y = imageY + (row * gridHeight);
          const transform = imageTransforms[index];

          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.beginPath();
          ctx.rect(x, y, gridWidth, gridHeight);
          ctx.clip();

          const mediaAspect = media instanceof HTMLVideoElement
            ? media.videoWidth / media.videoHeight
            : media.naturalWidth / media.naturalHeight;
          const cellAspect = gridWidth / gridHeight;

          let baseWidth, baseHeight;
          if (mediaAspect > cellAspect) {
            baseHeight = gridHeight;
            baseWidth = baseHeight * mediaAspect;
          } else {
            baseWidth = gridWidth;
            baseHeight = baseWidth / mediaAspect;
          }

          const scaledWidth = baseWidth * transform.zoom;
          const scaledHeight = baseHeight * transform.zoom;

          const centerX = x + gridWidth / 2;
          const centerY = y + gridHeight / 2;

          const drawX = centerX - scaledWidth / 2 + transform.offsetX;
          const drawY = centerY - scaledHeight / 2 + transform.offsetY;

          ctx.drawImage(media, drawX, drawY, scaledWidth, scaledHeight);

          // Draw image label if exists (before restore so it fades with image)
          if (imageLabels[index]) {
            const labelFontSize = 48;
            ctx.font = `bold ${labelFontSize}px ${fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const labelX = x + gridWidth / 2;
            const labelY = y + gridHeight / 2;

            // Draw thinner black stroke
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 6;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.strokeText(imageLabels[index], labelX, labelY);

            // Draw white text on top
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(imageLabels[index], labelX, labelY);
          }

          ctx.restore();

          if (showHighlight && selectedImageIndex === index) {
            ctx.strokeStyle = '#3B82F6';
            ctx.lineWidth = 6;
            ctx.strokeRect(x + 3, y + 3, gridWidth - 6, gridHeight - 6);
          }

          imagesLoaded++;
        };

        // Handle image
        if (loadedImagesRef.current[index] && loadedImagesRef.current[index]!.src === imgSrc) {
          drawMediaWithTransform(loadedImagesRef.current[index]!);
        } else {
          const img = new Image();
          img.src = imgSrc;
          img.onload = () => {
            loadedImagesRef.current[index] = img;
            drawMediaWithTransform(img);
          };
        }
      } else {
        loadedImagesRef.current[index] = null;
      }
    });
  };

  const drawMainCaption = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (!mainCaption) return;

    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Wrap text if it's too long
    const maxWidth = canvas.width - 80;
    const lines = wrapText(ctx, mainCaption, maxWidth);
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = (canvas.height - totalHeight) / 2 + lineHeight / 2;

    // Draw stroke
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    lines.forEach((line, index) => {
      ctx.strokeText(line, canvas.width / 2, startY + (index * lineHeight));
    });

    // Draw white text on top
    ctx.fillStyle = '#FFFFFF';
    lines.forEach((line, index) => {
      ctx.fillText(line, canvas.width / 2, startY + (index * lineHeight));
    });
  };

  // Generate video
  const generateVideo = async () => {
    if (!ffmpegRef.current || !ffmpegLoaded) {
      alert('FFmpeg is still loading. Please wait.');
      return;
    }

    if (images.every(img => img === null)) {
      alert('Please upload at least one image');
      return;
    }

    setIsRendering(true);
    setProgress('Preparing video...');
    setVideoUrl(null);

    try {
      const ffmpeg = ffmpegRef.current;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const fps = 30;

      // For images: use 10 second duration
      setProgress('Preparing frames...');
      const duration = 10;
      const totalFrames = fps * duration;

      for (let i = 0; i < totalFrames; i++) {
        let opacity = 1;
        if ((templateType === 'header-4-images' || templateType === 'header-single') && i < 30) {
          opacity = i / 30;
        }

        drawCanvas(canvas, false, opacity);

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => resolve(blob!), 'image/png');
        });

        const frameData = await fetchFile(blob);
        await ffmpeg.writeFile(`frame${String(i).padStart(4, '0')}.png`, frameData);

        if (i % 30 === 0) {
          setProgress(`Preparing frames: ${Math.round((i / totalFrames) * 100)}%`);
        }
      }

      setProgress('Encoding video...');

      const ffmpegArgs = [
        '-framerate', '30',
        '-i', 'frame%04d.png',
      ];

      // Add music if provided
      if (musicFile) {
        const musicData = await fetchFile(musicFile);
        await ffmpeg.writeFile('music.mp3', musicData);
        ffmpegArgs.push('-i', 'music.mp3', '-shortest');
      }

      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-t', '10',
        'output.mp4'
      );

      await ffmpeg.exec(ffmpegArgs);

      setProgress('Finalizing...');

      const data = await ffmpeg.readFile('output.mp4');
      const videoBlob = new Blob([data instanceof Uint8Array ? data : new Uint8Array()], { type: 'video/mp4' });
      const url = URL.createObjectURL(videoBlob);

      setVideoUrl(url);
      setProgress('Video ready!');
    } catch (error) {
      console.error('Error generating video:', error);
      setProgress(`Error: ${error}`);
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" onMouseMove={handleDragMove} onMouseUp={handleDragEnd}>
      {/* Template Selection Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <Tabs.Root value={templateType} onValueChange={(value) => setTemplateType(value as TemplateType)}>
            <Tabs.List className="flex gap-1 py-4">
              <Tabs.Trigger
                value="4-grid"
                className="px-6 py-3 rounded-lg text-sm font-medium transition data-[state=active]:bg-gray-800 data-[state=active]:text-white data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  4-Grid Images
                </div>
              </Tabs.Trigger>

              <Tabs.Trigger
                value="header-single"
                className="px-6 py-3 rounded-lg text-sm font-medium transition data-[state=active]:bg-gray-800 data-[state=active]:text-white data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Header + Single Image
                </div>
              </Tabs.Trigger>

              <Tabs.Trigger
                value="header-4-images"
                className="px-6 py-3 rounded-lg text-sm font-medium transition data-[state=active]:bg-gray-800 data-[state=active]:text-white data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Header + 4 Images
                </div>
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-[1fr_380px] gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Text Content Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  {templateType === '4-grid' ? 'Main Caption' : 'Text Content'}
                </h3>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              {/* Show header text for header templates */}
              {(templateType === 'header-single' || templateType === 'header-4-images') && (
                <div className="mb-3">
                  <label className="block text-xs text-gray-600 mb-1.5">Header Text</label>
                  <input
                    type="text"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    placeholder="Enter header text..."
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
              )}

              {/* Show main caption for 4-grid only */}
              {templateType === '4-grid' && (
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={mainCaption}
                    onChange={(e) => setMainCaption(e.target.value)}
                    placeholder="Enter your main caption here..."
                    className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                  <button
                    onClick={triggerUploadImages}
                    className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition font-medium flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Upload Images
                  </button>
                </div>
              )}

              {/* Font Controls */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1.5">Font</label>
                  <Select value={fontFamily} onValueChange={setFontFamily}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Arial">Arial</SelectItem>
                      <SelectItem value="Helvetica">Helvetica</SelectItem>
                      <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                      <SelectItem value="Georgia">Georgia</SelectItem>
                      <SelectItem value="Verdana">Verdana</SelectItem>
                      <SelectItem value="Courier New">Courier New</SelectItem>
                      <SelectItem value="Impact">Impact</SelectItem>
                      <SelectItem value="Comic Sans MS">Comic Sans MS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1.5">Font Size: {fontSize}px</label>
                  <input
                    type="range"
                    min="20"
                    max="120"
                    step="2"
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
                  />
                </div>
              </div>

              {/* Aspect Ratio Toggle */}
              <div className="flex items-center gap-4 mt-4">
                <span className="text-sm text-gray-600">Format:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAspectRatio('1:1')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                      aspectRatio === '1:1'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    1:1
                  </button>
                  <button
                    onClick={() => setAspectRatio('4:5')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                      aspectRatio === '4:5'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    4:5
                  </button>
                </div>
              </div>
            </div>

            {/* Image Upload Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  {templateType === 'header-single' ? 'Image' : 'Images'}
                </h3>
                {templateType !== '4-grid' && (
                  <button
                    onClick={triggerUploadImages}
                    className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Upload
                  </button>
                )}
              </div>

              {/* 4-Grid Layout */}
              {templateType === '4-grid' && (
                <div className="grid grid-cols-2 gap-4">
                  {[0, 1, 2, 3].map((index) => (
                    <label key={index} className="block">
                      <div className="aspect-square bg-gray-200 rounded-lg border border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition overflow-hidden relative">
                        {images[index] ? (
                          <img src={images[index]!} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <>
                            <svg className="w-12 h-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm text-gray-500">Click to upload image {index + 1}</span>
                          </>
                        )}
                      </div>
                      <input
                        ref={(el) => {fileInputRefs.current[index] = el}}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(index, e)}
                        className="hidden"
                      />
                    </label>
                  ))}
                </div>
              )}

              {/* Header + Single Image Layout */}
              {templateType === 'header-single' && (
                <label className="block">
                  <div className="aspect-video bg-gray-200 rounded-lg border border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition overflow-hidden relative">
                    {images[0] ? (
                      <img src={images[0]!} alt="Upload" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <svg className="w-16 h-16 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-base text-gray-600 font-medium">Click to upload image</span>
                        <span className="text-sm text-gray-400 mt-1">Image • Landscape orientation</span>
                      </>
                    )}
                  </div>
                  <input
                    ref={(el) => {fileInputRefs.current[0] = el}}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(0, e)}
                    className="hidden"
                  />
                </label>
              )}

              {/* Header + 4 Images Layout */}
              {templateType === 'header-4-images' && (
                <div className="grid grid-cols-2 gap-4">
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index} className="space-y-2">
                      <label className="block">
                        <div className="aspect-square bg-gray-200 rounded-lg border border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition overflow-hidden relative">
                          {images[index] ? (
                            <img src={images[index]!} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <>
                              <svg className="w-12 h-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-sm text-gray-500">Click to upload image {index + 1}</span>
                            </>
                          )}
                        </div>
                        <input
                          ref={(el) => {fileInputRefs.current[index] = el}}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(index, e)}
                          className="hidden"
                        />
                      </label>
                      <input
                        type="text"
                        value={imageLabels[index]}
                        onChange={(e) => {
                          const newLabels = [...imageLabels];
                          newLabels[index] = e.target.value;
                          setImageLabels(newLabels);
                        }}
                        placeholder={`Label for image ${index + 1}`}
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={generateVideo}
              disabled={isRendering || !ffmpegLoaded}
              className={`w-full py-4 rounded-lg font-semibold text-base transition flex items-center justify-center gap-2 ${
                isRendering || !ffmpegLoaded
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {isRendering ? 'Generating...' : ffmpegLoaded ? 'Generate Video' : 'Loading...'}
            </button>

            {progress && (
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <p className="text-sm text-blue-700">{progress}</p>
              </div>
            )}

            {/* Video Player */}
            {videoUrl && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Generated Video</h3>
                <video src={videoUrl} controls className="w-full rounded-lg border border-gray-300 mb-4" />
                <a
                  href={videoUrl}
                  download="social-media-video.mp4"
                  className="block w-full py-3 bg-gray-800 text-white rounded-lg text-center font-medium hover:bg-gray-700 transition"
                >
                  Download Video
                </a>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Preview */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Preview</h3>
                <span className="text-xs text-blue-600 font-medium">Click on image to adjust</span>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <canvas
                  ref={previewCanvasRef}
                  width={canvasDimensions.width}
                  height={canvasDimensions.height}
                  className="w-full h-auto cursor-pointer"
                  onClick={handlePreviewClick}
                  onMouseDown={handlePreviewDragStart}
                />
              </div>

              {/* Zoom Controls - Always visible */}
              <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-medium ${selectedImageIndex !== null && images[selectedImageIndex] ? 'text-gray-700' : 'text-gray-400'}`}>
                    {selectedImageIndex !== null && images[selectedImageIndex]
                      ? `Image ${selectedImageIndex + 1} - Adjust & Position`
                      : 'Click on image to adjust'}
                  </span>
                  {selectedImageIndex !== null && images[selectedImageIndex] && (
                    <button
                      onClick={() => setSelectedImageIndex(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <svg className={`w-4 h-4 ${selectedImageIndex !== null && images[selectedImageIndex] ? 'text-gray-500' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                    </svg>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.1"
                      value={selectedImageIndex !== null && images[selectedImageIndex] ? imageTransforms[selectedImageIndex].zoom : 1}
                      onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                      disabled={selectedImageIndex === null || !images[selectedImageIndex]}
                      className={`flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 ${selectedImageIndex === null || !images[selectedImageIndex] ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                    <svg className={`w-4 h-4 ${selectedImageIndex !== null && images[selectedImageIndex] ? 'text-gray-500' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                    </svg>
                  </div>

                  <p className={`text-xs text-center ${selectedImageIndex !== null && images[selectedImageIndex] ? 'text-gray-500' : 'text-gray-400'}`}>
                    {selectedImageIndex !== null && images[selectedImageIndex]
                      ? '💡 Drag on preview to reposition'
                      : 'Select an image to zoom & reposition'}
                  </p>
                </div>
              </div>
            </div>


            {/* Upload Music */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-700">Upload Music</h3>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <button className="px-4 py-1.5 border border-gray-300 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
                  Free Tracks
                </button>
              </div>
              <label className="block">
                <div className="aspect-square bg-white border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition">
                  {musicFile ? (
                    <div className="text-center px-4">
                      <svg className="w-12 h-12 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      <p className="text-sm font-medium text-gray-700 truncate">{musicFile.name}</p>
                    </div>
                  ) : (
                    <>
                      <svg className="w-12 h-12 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      <p className="text-sm font-medium text-gray-600 mb-1">Click or drag to upload music</p>
                      <p className="text-xs text-gray-400">MP3, Wav files accepted</p>
                    </>
                  )}
                </div>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleMusicUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* About This Template */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">About This Template</h3>
              <p className="text-xs text-gray-600 leading-relaxed mb-4">
                This 4 image grid format has been used to bring in 100,000+ free users to mobile apps. Optimal conversion method for users is putting CTA in caption, or making last picture your business/app. Make sure video is relevant to your business. Use catchy music and aim to make people comment (check examples).
              </p>
              <button className="w-full py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                Viral Examples
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden canvas for rendering */}
      <canvas ref={canvasRef} width={canvasDimensions.width} height={canvasDimensions.height} className="hidden" />
    </div>
  );
}
