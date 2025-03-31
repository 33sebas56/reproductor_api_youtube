import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ 
      error: 'La búsqueda debe tener al menos 2 caracteres' 
    });
  }

  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/search`, {
        params: {
          part: 'snippet',
          q: q,
          type: 'video',
          key: apiKey,
          maxResults: 5
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error en la API de YouTube:', error.response?.data || error.message);
    
    return res.status(500).json({ 
      error: 'No se pudo realizar la búsqueda. Inténtalo de nuevo.' 
    });
  }
}