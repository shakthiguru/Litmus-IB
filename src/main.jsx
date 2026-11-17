import { createRoot } from 'react-dom/client';
import { initDB } from './store.js';
import App from './App.jsx';
import './styles.css';

initDB().then(() => {
  createRoot(document.getElementById('root')).render(<App />);
});
