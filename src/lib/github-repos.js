// 页面渲染、链接悬停预取和正式构建共用只读请求器。
// 成功数据只放进程内存，不改写 src/data，否则 Vite 会将一次悬停误判为源码更新。
export function createRepoReader({ fetcher = globalThis.fetch, now = Date.now, ttl = 300_000 } = {}) {
  const entries = new Map();
  return async function readRepos(user, fallback = []) {
    if (!user || !/^[a-z\d-]{1,39}$/i.test(user)) return fallback;
    const previous = entries.get(user);
    if (previous?.pending) return previous.pending;
    if (previous && previous.until > now()) return previous.repos;
    const entry = { repos: previous?.repos ?? fallback, until: 0, pending: null };
    entries.set(user, entry);
    entry.pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const complete=[];
        for(let page=1;;page++) {
          const response = await fetcher(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed&type=owner&page=${page}`, {
            headers: { 'User-Agent': 'Akiro-Website/astro', Accept: 'application/vnd.github+json' }, signal: controller.signal,
          });
          if(!response.ok) throw Error('GitHub 暂不可用');
          const repos=await response.json();
          if(!Array.isArray(repos)) throw Error('GitHub 响应不是仓库列表');
          complete.push(...repos.filter((repo)=>repo && typeof repo.name==='string' && typeof repo.html_url==='string' && !repo.private));
          if(repos.length<100) break;
        }
        // 所有页成功后再替换；后续页限流不能让页面突然只剩部分项目。
        entry.repos=complete;
      } catch {
        // 网络失败时保留上一次成功结果；短期内重复预取仍返回缓存，避免请求风暴。
      } finally {
        clearTimeout(timer);
        entry.until = now() + ttl;
        entry.pending = null;
      }
      return entry.repos;
    })();
    return entry.pending;
  };
}
export const readGithubRepos = createRepoReader();
