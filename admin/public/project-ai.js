// 每次后台局部换页后由 initPage 调用；以节点标记避免重复绑定。
window.initProjectAI = function initProjectAI({ api, toast, confirmAction }) {
  const panel = document.getElementById('project-ai');
  if (!panel || panel.dataset.bound) return;
  panel.dataset.bound = 'true';
  const key = panel.querySelector('#project-ai-key');
  const status = panel.querySelector('#project-ai-status');
  const analyze = panel.querySelector('#project-ai-analyze');
  const saveKey = panel.querySelector('#project-ai-save-key');
  const updateStatus = (config) => { status.textContent = config.configured ? 'DeepSeek 密钥已配置' : '尚未配置 DeepSeek 密钥'; };
  api('/api/manage/projects/ai/config').then(updateStatus).catch((error) => { status.textContent = error.message; });
  saveKey?.addEventListener('click', async () => {
    if (!key.value.trim()) { toast('请输入 API 密钥', true); return; }
    saveKey.disabled = true;
    try {
      updateStatus(await api('/api/manage/projects/ai/config', { method: 'POST', body: { apiKey: key.value.trim() } }));
      key.value = '';
      toast('API 密钥已保存');
    } catch (error) { toast(error.message, true); }
    finally { saveKey.disabled = false; }
  });
  panel.querySelector('#project-ai-clear-key')?.addEventListener('click', async () => {
    if (!await confirmAction('确定清除已保存的 DeepSeek API 密钥？')) return;
    try {
      updateStatus(await api('/api/manage/projects/ai/config', { method: 'POST', body: { apiKey: '' } }));
      key.value = '';
      toast('API 密钥已清除');
    } catch (error) { toast(error.message, true); }
  });
  analyze?.addEventListener('click', async () => {
    const ids = ['pj-title', 'pj-slug', 'pj-subtitle', 'pj-description', 'pj-tech', 'pj-links', 'pj-content'];
    const fields = ids.map((id) => document.getElementById(id));
    if (fields.some((field) => field?.value.trim()) && !await confirmAction('分析结果将替换当前项目介绍字段，是否继续？')) return;
    const valuesBefore = fields.map((field) => field?.value);
    const projectId = document.getElementById('pj-id')?.value;
    analyze.disabled = true;
    analyze.textContent = '正在分析仓库…';
    try {
      const { draft } = await api('/api/manage/projects/ai/analyze', { method: 'POST', body: { repositoryUrl: panel.querySelector('#project-ai-repository').value.trim() } });
      // 网络等待期间若切换项目或手工编辑，放弃回填，防止覆盖新内容。
      if (!panel.isConnected || document.getElementById('pj-id')?.value !== projectId || fields.some((field, i) => field?.value !== valuesBefore[i])) {
        toast('表单已变化，未覆盖当前内容，请重新分析', true);
        return;
      }
      const values = [draft.title, draft.slug, draft.subtitle, draft.description, draft.tech.join(', '), draft.links.map((link) => `${link.label}|${link.url}`).join('\n'), draft.content];
      fields.forEach((field, i) => { if (field) { field.value = values[i] || ''; field.dispatchEvent(new Event('input', { bubbles: true })); } });
      toast('已填入项目草稿，请检查后保存');
    } catch (error) { toast(error.message, true); }
    finally { analyze.disabled = false; analyze.textContent = '分析仓库并填入'; }
  });
};
