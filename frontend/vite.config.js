import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
        port: Number(process.env.VITE_DEV_SERVER_PORT ?? 5173),
    },
});
