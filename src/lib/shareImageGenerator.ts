import { toPng, toBlob } from 'html-to-image';

export async function generateShareImage(element: HTMLElement): Promise<Blob | null> {
  try {
    const blob = await toBlob(element, {
      pixelRatio: 2, // 2x for retina displays
      backgroundColor: '#0F172A',
    });
    return blob;
  } catch (error) {
    console.error('Failed to generate share image:', error);
    return null;
  }
}

export async function generateShareDataUrl(element: HTMLElement): Promise<string | null> {
  try {
    const dataUrl = await toPng(element, {
      pixelRatio: 2,
      backgroundColor: '#0F172A',
    });
    return dataUrl;
  } catch (error) {
    console.error('Failed to generate share image:', error);
    return null;
  }
}

export async function downloadShareImage(element: HTMLElement, filename: string): Promise<boolean> {
  try {
    const dataUrl = await generateShareDataUrl(element);
    if (!dataUrl) return false;

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
    return true;
  } catch (error) {
    console.error('Failed to download share image:', error);
    return false;
  }
}

export async function shareImage(element: HTMLElement, title: string, url: string): Promise<boolean> {
  if (!navigator.share) return false;

  try {
    const blob = await generateShareImage(element);
    if (!blob) return false;

    const file = new File([blob], 'robozzle-share.png', { type: 'image/png' });

    await navigator.share({
      title,
      url,
      files: [file],
    });
    return true;
  } catch (error) {
    // User cancelled or error
    console.error('Share failed:', error);
    return false;
  }
}

export async function shareGif(gifBlob: Blob, title: string, url: string): Promise<boolean> {
  if (!navigator.share) return false;

  try {
    const file = new File([gifBlob], 'robozzle-share.gif', { type: 'image/gif' });

    await navigator.share({
      title,
      url,
      files: [file],
    });
    return true;
  } catch (error) {
    // User cancelled or error
    console.error('Share failed:', error);
    return false;
  }
}
