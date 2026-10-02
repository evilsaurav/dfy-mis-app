import fs from 'fs';
import path from 'path';

export function getFullAdminDashboardCode() {
  const adminPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
  let code = fs.readFileSync(adminPath, 'utf8');
  const componentsDir = path.resolve('dfy-frontend/src/components/Admin');
  const hooksDir = path.resolve('dfy-frontend/src/hooks');
  const utilsDir = path.resolve('dfy-frontend/src/utils');

  const readDir = (dir) => {
    if (!fs.existsSync(dir)) return '';
    return fs.readdirSync(dir, { recursive: true })
      .filter(f => f.endsWith('.jsx') || f.endsWith('.js'))
      .map(f => fs.readFileSync(path.resolve(dir, f), 'utf8'))
      .join('\n');
  };

  return code + '\n' + readDir(componentsDir) + '\n' + readDir(hooksDir) + '\n' + readDir(utilsDir);
}
