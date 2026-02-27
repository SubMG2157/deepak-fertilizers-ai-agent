import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

async function updateNgrok() {
    try {
        const response = await fetch('http://localhost:4040/api/tunnels');
        const data = await response.json() as any;

        // Find the https tunnel
        const publicUrl = data.tunnels?.find((t: any) => t.public_url.startsWith('https'))?.public_url;

        if (!publicUrl) {
            console.error('❌ No active HTTPS ngrok tunnel found on port 4040.');
            process.exit(1);
        }

        // Update .env.local files in both root and backend (in case there are multiple)
        const envFiles = [
            join(process.cwd(), '.env.local'),
            join(process.cwd(), 'backend', '.env.local')
        ];

        let updated = false;
        for (const file of envFiles) {
            if (existsSync(file)) {
                let content = readFileSync(file, 'utf8');
                if (content.includes('BACKEND_BASE_URL=')) {
                    content = content.replace(/BACKEND_BASE_URL=.*/g, `BACKEND_BASE_URL=${publicUrl}`);
                } else {
                    content += `\nBACKEND_BASE_URL=${publicUrl}\n`;
                }
                writeFileSync(file, content);
                console.log(`✅ Updated ${file} with URL: ${publicUrl}`);
                updated = true;
            }
        }

        if (updated) {
            console.log('🚀 Successfully updated Ngrok URL! Please restart your backend server.');
        } else {
            console.warn('⚠️ No .env.local files found to update.');
        }

    } catch (err: any) {
        console.error('❌ Failed to fetch ngrok API. Is ngrok running?', err.message);
    }
}

updateNgrok();
