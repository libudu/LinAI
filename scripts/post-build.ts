import fs from 'fs-extra';
import { execSync } from 'child_process';

function main() {
  console.log('🚀 [Post-build] Starting...');

  // 1. 复制 package.json 到 dist 目录
  fs.copyFileSync('package.json', 'dist/package.json');
  console.log('✅ [Post-build] Copied package.json to dist/');

  // 2. 复制 dist-template 目录中的所有文件到 dist 目录
  const templateDir = 'dist-template';
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, 'dist', { overwrite: true });
    console.log('✅ [Post-build] Copied dist-template contents to dist/');
  } else {
    console.log(`⚠️ [Post-build] Directory ${templateDir} does not exist, skipping.`);
  }

  // 3. 在 dist 目录中安装生产环境依赖
  console.log('📦 [Post-build] Installing production dependencies in dist/ ...');
  execSync('pnpm install --prod --shamefully-hoist', { cwd: 'dist', stdio: 'inherit' });

  console.log('🎉 [Post-build] Completed successfully.');
}

main();
