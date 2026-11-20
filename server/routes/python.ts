import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sanitizePythonTickers } from '../../src/utils/serverSecurity.ts';

const execFileAsync = promisify(execFile);

export function createPythonRouter(): Router {
  const router = Router();

  router.post('/api/run-python', async (req: Request, res: Response) => {
    const sanitized = sanitizePythonTickers(req.body?.tickers);
    if (!sanitized.ok) {
      return res.status(400).json({
        success: false,
        error: sanitized.error,
        stdout: '',
        stderr: '',
      });
    }

    const args = ['trullas_scanner_247.py', '--tickers', ...sanitized.tickers, '--once'];
    const cmd = `python3 ${args.join(' ')}`;

    try {
      const { stdout, stderr } = await execFileAsync('python3', args, { timeout: 15000 });
      res.json({
        success: true,
        command: cmd,
        stdout,
        stderr,
      });
    } catch (err: any) {
      res.json({
        success: false,
        command: cmd,
        error: err.message,
        stdout: err.stdout || '',
        stderr: err.stderr || '',
      });
    }
  });

  router.get('/api/download-python', (_req: Request, res: Response) => {
    const filePath = path.join(process.cwd(), 'trullas_scanner_247.py');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/x-python');
      res.setHeader('Content-Disposition', 'attachment; filename="trullas_scanner_247.py"');
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.status(404).send('Script file not found');
    }
  });

  return router;
}
