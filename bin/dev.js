const { exec } = require('child-process-promise');
const { spawn } = require('child_process');

const dev = async () => {
  await exec('npm run build-dev');
  const child = spawn(
    'cross-env NODE_ENV=development node',
    ['./bin/backend/index.js'],
    {
      shell: true,
    }
  );

  /**
   * Log data from the child process's standard output.
   */
  child.stdout.on('data', (data) => {
    console.log(`${data}`);
  });

  /**
   * Log error data from the child process's standard error in red color.
   */
  child.stderr.on('data', (data) => {
    console.error('\x1b[31m', ` ERROR :\n${data}`);
  });
};

dev();
