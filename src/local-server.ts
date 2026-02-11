import app from './app';

const PORT = process.env.PORT || 5000;

// ✅ SOLO AQUÍ DEBE ESTAR app.listen()
app.listen(PORT, () => {
  console.log(`🚀 Servidor local: http://localhost:${PORT}`);
  console.log(`📁 Health check: http://localhost:${PORT}/health`);
  console.log(`📁 API Root: http://localhost:${PORT}/`);
});