import config from '../data/site.config.json';
import cachedRepos from '../data/github-projects.json';
import { readGithubRepos } from './github-repos.js';
import { buildProjectCatalog } from './project-catalog.js';
import { getProjects } from './site-content';
import fs from 'node:fs';
import path from 'node:path';

// 关于与项目页在构建时调用同一只读数据源；悬停预取不会写入 src/data。
export async function getProjectCatalog(): Promise<ReturnType<typeof buildProjectCatalog>> {
  if (process.env.BLOG_RELEASE_BUILD === 'true') {
    return JSON.parse(fs.readFileSync(path.resolve('data/release-state.json'), 'utf8')).catalog;
  }
  return buildProjectCatalog({config,repos:await readGithubRepos(config.githubUser,cachedRepos),managed:getProjects()});
}
