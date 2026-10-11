// A screenshot or photo for a support ticket, made small before it's sent: at most 1600px on
// its longest side, as JPEG. A phone photo goes from several MB to a few hundred KB, which is
// what the ticket's database rows and a shop's mobile data can afford. Resolves to a data URL.
const MAX_SIDE = 1600;
const QUALITY = 0.82;

export const shrinkImage = (file) =>
  new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) {
      reject(new Error("not-an-image"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      // JPEG has no transparency: a transparent screenshot would otherwise turn black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable-image"));
    };
    img.src = url;
  });

// Bytes of a base64 data URL, to warn before sending something too big.
export const dataUrlBytes = (dataUrl) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
