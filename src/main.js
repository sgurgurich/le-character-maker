// Entry point of the packaged exe.
//   LE-Character-Maker.exe            opens the app window (no console)
//   LE-Character-Maker.exe cli ...    runs the command-line tool
// A double-click starts a console app, so it relaunches itself hidden to serve
// the app window and exits.
import { spawn } from 'node:child_process';
import { seedUserDir } from './paths.js';

seedUserDir();

const args = process.argv.slice(2);

if (args[0] === 'cli') {
  process.argv = [process.argv[0], 'le-char', ...args.slice(1)];
  import('./cli.js');
} else if (args[0] === '--serve') {
  process.argv = [process.argv[0], 'le-char', '--open'];
  import('./server.js');
} else {
  spawn(process.execPath, ['--serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  process.exit(0);
}
