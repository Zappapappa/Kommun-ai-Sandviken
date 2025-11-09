// api/feedback.js
// Endpoint för att ta emot feedback från användare

import { updateQueryFeedback } from '../lib/logging.js';

export default async function handler(req, res) {
  // Endast POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query_id, feedback } = req.body;
    
    // Validera input
    if (!query_id || typeof query_id !== 'number') {
      return res.status(400).json({ error: 'Missing or invalid query_id' });
    }
    
    if (![1, -1].includes(feedback)) {
      return res.status(400).json({ error: 'Feedback must be 1 (positive) or -1 (negative)' });
    }

    // Uppdatera feedback i databasen
    const success = await updateQueryFeedback(query_id, feedback);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to update feedback' });
    }

    res.status(200).json({ 
      success: true,
      message: 'Feedback received',
      query_id,
      feedback 
    });
    
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: err.message });
  }
}
