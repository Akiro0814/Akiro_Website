import config from '../data/site.config.json';
import cachedRepos from '../data/github-projects.json';
import { readGithubRepos } from './github-repos.js';
import { buildProjectCatalog } from './project-catalog.js';
import { getProjects } from './site-content';

// 关于与项目页在构建时调用同一只读数据源；悬停预取不会写入 src/data。
export async function getProjectCatalog() {
  return buildProjectCatalog({config,repos:await readGithubRepos(config.githubUser,cachedRepos),managed:getProjects()});
}
