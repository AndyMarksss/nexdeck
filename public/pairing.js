let decoderPromise;
function loadDecoder() {
  if (!decoderPromise) {
    decoderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/qr-decoder.js';
      script.onload = () => {
        if (typeof window.jsQR === 'function') resolve(window.jsQR);
        else reject(new Error('O leitor de QR não está disponível.'));
      };
      script.onerror = () => reject(new Error('Não foi possível carregar o leitor de QR.'));
      document.head.append(script);
    }).catch((error) => { decoderPromise = undefined; throw error; });
  }
  return decoderPromise;
}

export function setupPairReader(applyPairing) {
  const dialog = document.getElementById('mobile-pair');
  const message = document.getElementById('mobile-pair-message');
  const openCamera = document.getElementById('scan-camera');
  const photo = document.getElementById('scan-photo');
  const input = document.getElementById('pair-url');
  const submit = document.getElementById('pair-submit');
  const video = document.getElementById('scan-preview');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let stream;
  let generation = 0;
  let timer;
  let busy = false;

  function stop() {
    generation += 1;
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    video.srcObject = null;
    video.hidden = true;
    openCamera.disabled = false;
  }

  async function useCode(value) {
    if (busy || !dialog.open) return false;
    busy = true;
    submit.disabled = true;
    message.textContent = 'Verificando o pareamento…';
    try {
      await applyPairing(value);
      if (dialog.open) dialog.close();
      return true;
    } catch (error) {
      if (dialog.open) message.textContent = error.message;
      return false;
    } finally {
      busy = false;
      submit.disabled = false;
    }
  }

  function decode(decoder, image, width, height) {
    const scale = Math.min(1, 720 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return decoder(context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })?.data;
  }

  openCamera.hidden = !navigator.mediaDevices?.getUserMedia;
  openCamera.onclick = async () => {
    stop();
    const attempt = generation;
    openCamera.disabled = true;
    message.textContent = 'Permita o acesso à câmera e aponte para o QR no computador.';
    try {
      const candidate = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (attempt !== generation) {
        candidate.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = candidate;
      video.srcObject = candidate;
      video.hidden = false;
      await video.play();
      const decoder = await loadDecoder();
      let lastCode;
      async function scan() {
        if (attempt !== generation) return;
        try {
          const value = video.videoWidth && decode(decoder, video, video.videoWidth, video.videoHeight);
          if (value && value !== lastCode && !busy) {
            lastCode = value;
            if (await useCode(value)) return;
          }
        } catch {
          stop();
          message.textContent = 'Não foi possível ler a câmera. Tire uma foto do QR ou cole o link.';
          return;
        }
        if (attempt === generation) timer = setTimeout(scan, 220);
      }
      void scan();
    } catch (error) {
      if (attempt !== generation) return;
      stop();
      message.textContent = error.name === 'NotAllowedError'
        ? 'A câmera não foi autorizada. Tire uma foto do QR ou cole o link.'
        : 'Não foi possível abrir a câmera. Tire uma foto do QR ou cole o link.';
    }
  };

  document.getElementById('scan-photo-button').onclick = () => { stop(); photo.click(); };
  photo.onchange = async () => {
    const file = photo.files[0];
    photo.value = '';
    if (!file) return;
    try {
      const decoder = await loadDecoder();
      const bitmap = await createImageBitmap(file);
      let value;
      try { value = decode(decoder, bitmap, bitmap.width, bitmap.height); }
      finally { bitmap.close(); }
      if (value) await useCode(value);
      else message.textContent = 'Nenhum QR encontrado. Tire outra foto com o código centralizado ou cole o link.';
    } catch {
      message.textContent = 'Não foi possível ler essa foto. Tente outra imagem ou cole o link.';
    }
  };
  document.getElementById('pair-form').onsubmit = (event) => {
    event.preventDefault();
    stop();
    void useCode(input.value);
  };
  dialog.addEventListener('close', () => {
    stop();
    input.value = '';
    message.textContent = '';
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && stream) stop(); });
  return () => dialog.showModal();
}
