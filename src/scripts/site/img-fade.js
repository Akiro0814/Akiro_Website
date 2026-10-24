// 文章图片的字节一旦到达就打上标记，让 CSS 能将其淡入。
export function initImgFade(signal) {
  document.querySelectorAll('.post-content img').forEach((img) => {
    const mark = () => img.classList.add('is-loaded');
    if (img.complete) {
      mark();
      return;
    }
    // 快速换页时撤销尚未完成的图片监听，避免旧页面图片继续触发逻辑。
    img.addEventListener('load', mark, { once: true, signal });
    img.addEventListener('error', mark, { once: true, signal });
  });
}
