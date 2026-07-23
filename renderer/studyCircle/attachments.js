(function initStudyCircleAttachments(root) {
  'use strict';

  const MAX_ATTACHMENTS = 9;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
  }

  function fileExtension(file, mediaType) {
    const match = String(file?.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] || (mediaType === 0 ? 'jpg' : 'mp3');
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
  }

  function audioDuration(file) {
    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      const url = URL.createObjectURL(file);
      const finish = (seconds) => {
        URL.revokeObjectURL(url);
        resolve(Math.max(1, Math.ceil(Number(seconds) || 1)));
      };
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => finish(audio.duration);
      audio.onerror = () => finish(1);
      audio.src = url;
    });
  }

  function responseData(response) {
    if (!response || response.code !== 200) throw new Error(response?.msg || '附件上传失败');
    const data = response.data && typeof response.data === 'object' ? response.data : response;
    if (!data.url) throw new Error('附件上传成功但未返回资源地址');
    return data;
  }

  function create({ container, imageInput, audioInput, onChange = () => {} }) {
    const items = [];
    let sequence = 0;

    function itemHtml(item) {
      const preview = item.mediaType === 0
        ? `<img src="${escapeHtml(item.previewUrl)}" alt="待上传图片">`
        : `<audio controls preload="metadata" src="${escapeHtml(item.previewUrl)}"></audio>`;
      const status = item.status === 'uploading' ? '上传中...'
        : item.status === 'failed' ? escapeHtml(item.error || '上传失败') : '已上传';
      return `<article class="attachment-item ${item.status}" data-attachment-id="${item.id}">
        <div class="attachment-preview">${preview}</div>
        <div class="attachment-info"><strong>${escapeHtml(item.file.name)}</strong><span>${status}</span></div>
        ${item.status === 'failed' ? '<button type="button" data-attachment-action="retry">重试</button>' : ''}
        <button class="attachment-remove" type="button" data-attachment-action="remove" aria-label="删除附件" title="删除">×</button>
      </article>`;
    }

    function render() {
      container.innerHTML = items.map(itemHtml).join('');
      container.hidden = items.length === 0;
      onChange({ count: items.length, uploading: isUploading(), failed: hasFailed() });
    }

    async function upload(item) {
      item.status = 'uploading';
      item.error = '';
      render();
      try {
        const [base64, duration] = await Promise.all([
          readFile(item.file),
          item.mediaType === 1 ? audioDuration(item.file) : Promise.resolve(0),
        ]);
        const data = responseData(await root.msykAPI.uploadStudyCircleMedia({
          base64,
          ext: fileExtension(item.file, item.mediaType),
          contentType: item.file.type || (item.mediaType === 0 ? 'image/jpeg' : 'audio/mpeg'),
          mediaType: item.mediaType,
        }));
        if (!items.includes(item)) return;
        item.url = data.url;
        item.duration = duration;
        item.status = 'ready';
      } catch (error) {
        if (!items.includes(item)) return;
        item.status = 'failed';
        item.error = error?.message || '上传失败';
      }
      render();
    }

    function addFiles(fileList, mediaType) {
      const files = Array.from(fileList || []);
      const remaining = MAX_ATTACHMENTS - items.length;
      if (remaining <= 0) {
        onChange({ count: items.length, uploading: isUploading(), failed: hasFailed(), message: '图片和音频合计最多 9 个' });
        return;
      }
      files.slice(0, remaining).forEach((file) => {
        const item = {
          id: String(++sequence), file, mediaType, status: 'uploading',
          previewUrl: URL.createObjectURL(file), url: '', duration: 0, error: '',
        };
        items.push(item);
        upload(item);
      });
      render();
      if (files.length > remaining) {
        onChange({ count: items.length, uploading: isUploading(), failed: hasFailed(), message: '图片和音频合计最多 9 个' });
      }
    }

    function remove(item) {
      const index = items.indexOf(item);
      if (index < 0) return;
      items.splice(index, 1);
      URL.revokeObjectURL(item.previewUrl);
      render();
    }

    function isUploading() { return items.some((item) => item.status === 'uploading'); }
    function hasFailed() { return items.some((item) => item.status === 'failed'); }

    imageInput.addEventListener('change', () => {
      addFiles(imageInput.files, 0);
      imageInput.value = '';
    });
    audioInput.addEventListener('change', () => {
      addFiles(audioInput.files, 1);
      audioInput.value = '';
    });
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-attachment-action]');
      const row = event.target.closest('[data-attachment-id]');
      const item = items.find((entry) => entry.id === row?.dataset.attachmentId);
      if (!button || !item) return;
      if (button.dataset.attachmentAction === 'remove') remove(item);
      if (button.dataset.attachmentAction === 'retry') upload(item);
    });

    return {
      isUploading,
      hasFailed,
      payload() {
        return {
          picUrls: items.filter((item) => item.mediaType === 0 && item.status === 'ready').map((item) => item.url),
          audioList: items.filter((item) => item.mediaType === 1 && item.status === 'ready')
            .map((item) => ({ url: item.url, size: item.duration })),
        };
      },
      clear() {
        items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        items.length = 0;
        render();
      },
    };
  }

  root.StudyCircleAttachments = Object.freeze({ create, max: MAX_ATTACHMENTS });
})(window);
