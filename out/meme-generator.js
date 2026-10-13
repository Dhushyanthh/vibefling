// Canvas-based Meme PNG Exporter for Vibefling

export async function exportMemeAsPng(photo, title = 'vibefling-meme') {
  return new Promise((resolve, reject) => {
    // If it's a text-only note
    if (photo.kind === 'text') {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');

      // Gradient background
      const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
      grad.addColorStop(0, '#FF033E');
      grad.addColorStop(1, '#8A00FF');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1080);

      // Quote text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 56px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      wrapText(ctx, `"${photo.cap || photo.top || ''}"`, 540, 500, 900, 75);

      // Branding watermark
      ctx.font = '32px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText('🌴 Vibefling', 540, 980);

      downloadCanvas(canvas, `${title}.png`);
      return resolve();
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const width = img.naturalWidth || 1080;
        const height = img.naturalHeight || 1080;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Apply visual CSS filters to canvas context
        if (photo.filter === 'f-bw') {
          ctx.filter = 'grayscale(100%)';
        } else if (photo.filter === 'f-sepia') {
          ctx.filter = 'sepia(90%)';
        } else if (photo.filter === 'f-pop') {
          ctx.filter = 'contrast(120%) saturate(190%)';
        } else if (photo.filter === 'f-fry') {
          ctx.filter = 'contrast(240%) saturate(260%) hue-rotate(-15deg)';
        } else {
          ctx.filter = 'none';
        }

        // Draw original media
        ctx.drawImage(img, 0, 0, width, height);

        // Reset filter before drawing text & stickers
        ctx.filter = 'none';

        // Meme Font Setup (Classic Impact font)
        const fontSize = Math.max(28, Math.round(width * 0.08));
        ctx.font = `900 ${fontSize}px Impact, 'Arial Black', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.12));
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 2;

        const padX = width / 2;
        const maxTextWidth = width * 0.92;

        // Top Text
        if (photo.top) {
          ctx.textBaseline = 'top';
          const topText = photo.top.toUpperCase();
          const topY = Math.round(height * 0.04);
          ctx.strokeText(topText, padX, topY, maxTextWidth);
          ctx.fillText(topText, padX, topY, maxTextWidth);
        }

        // Bottom Text
        if (photo.bot) {
          ctx.textBaseline = 'bottom';
          const botText = photo.bot.toUpperCase();
          const botY = Math.round(height * 0.96);
          ctx.strokeText(botText, padX, botY, maxTextWidth);
          ctx.fillText(botText, padX, botY, maxTextWidth);
        }

        // Sticker
        if (photo.sticker) {
          const stickerSize = Math.max(48, Math.round(width * 0.18));
          ctx.font = `${stickerSize}px serif, "Apple Color Emoji", "Segoe UI Emoji"`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(photo.sticker, width * 0.93, height * 0.5);
        }

        // Subtle watermark
        ctx.font = `bold ${Math.max(14, Math.round(width * 0.022))}px system-ui, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 2;
        const wmText = 'vibefling 🌴';
        ctx.strokeText(wmText, width - 16, height - 12);
        ctx.fillText(wmText, width - 16, height - 12);

        downloadCanvas(canvas, `${title}-${Date.now()}.png`);
        resolve();
      } catch (err) {
        console.error('Error generating meme PNG:', err);
        // Fallback if canvas is tainted by cross-origin without CORS
        fallbackDirectDownload(photo.url, title);
        resolve();
      }
    };

    img.onerror = () => {
      fallbackDirectDownload(photo.url, title);
      resolve();
    };

    img.src = photo.url;
  });
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/png');
}

function fallbackDirectDownload(url, filename) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.download = `${filename}.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      lines.push(line);
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => {
    ctx.fillText(l.trim(), x, startY + i * lineHeight);
  });
}
