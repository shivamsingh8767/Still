import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, GenerateVideosOperation } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Image asset registry
const imageAssetMap = {
  'still-fashion-hero.png': 'still_fashion_hero_1790537909895.jpg',
  'still-brand-story.png': 'still_brand_story_1790538484809.jpg',
  'still-category-accessories.png': 'still_category_accessories_1790538426542.jpg',
  'still-category-clothing.png': 'still_category_clothing_1790538444953.jpg',
  'still-category-footwear.png': 'still_editorial_footwear_1790538560161.jpg',
  'still-category-watches.png': 'still_editorial_timepieces_1790538576688.jpg',
  'still-category-headwear.png': 'still_product_cap_1790538405438.jpg',
  'still-editorial-footwear.png': 'still_editorial_footwear_1790538560161.jpg',
  'still-editorial-timepieces.png': 'still_editorial_timepieces_1790538576688.jpg',
  'still-featured-aw26.png': 'still_featured_aw26_1790538464889.jpg',
  'still-journal-craft.png': 'still_journal_craft_1790538523138.jpg',
  'still-journal-design.png': 'still_journal_design_1790538538405.jpg',
  'still-journal-style.png': 'still_journal_style_1790538503044.jpg',
  'still-product-cap.png': 'still_product_cap_1790538405438.jpg',
  'still-product-overshirt.png': 'still_product_overshirt_1790538298519.jpg',
  'still-product-runner.png': 'still_product_runner_1790538329238.jpg',
  'still-product-watch.png': 'still_product_watch_1790538388696.jpg',
  'still-product-oxford.png': 'still_product_oxford_1790539205030.jpg',
  'still-product-knit.png': 'still_product_knit_1790539231969.jpg',
  'still-product-trousers.png': 'still_product_trousers_1790539262184.jpg',
  'still-product-tee.png': 'still_product_tee_1790539279205.jpg',
  'still-product-jacket.png': 'still_product_jacket_1790539296423.jpg',
  'still-product-loafer.png': 'still_product_loafer_1790539317982.jpg',
  'still-product-watch-minimal.png': 'still_product_watch_minimal_1790539335778.jpg',
  'still-product-cardholder.png': 'still_product_cardholder_1790539356257.jpg'
};

// Route mapped image requests
app.get('/:imgName.png', (req, res, next) => {
  const reqName = `${req.params.imgName}.png`;
  const targetImage = imageAssetMap[reqName];
  if (targetImage) {
    const assetPath = path.join(__dirname, 'src/assets/images', targetImage);
    if (fs.existsSync(assetPath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      return res.sendFile(assetPath);
    }
  }
  next();
});

// Route for hero background video
app.get(['/still-hero-video.mp4', '/assets/still-hero-video.mp4'], (req, res, next) => {
  const videoPath = path.join(__dirname, 'src/assets/videos/still-hero-video.mp4');
  if (fs.existsSync(videoPath)) {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(videoPath);
  }
  next();
});

// Endpoint to fetch reference image as Base64 for video generation
app.get('/api/reference-image/:id', (req, res) => {
  const reqName = req.params.id.endsWith('.png') ? req.params.id : `${req.params.id}.png`;
  const targetImage = imageAssetMap[reqName] || (imageAssetMap[`still-${req.params.id}.png`]);
  if (targetImage) {
    const assetPath = path.join(__dirname, 'src/assets/images', targetImage);
    if (fs.existsSync(assetPath)) {
      const fileData = fs.readFileSync(assetPath);
      const base64 = fileData.toString('base64');
      return res.json({
        name: reqName,
        mimeType: 'image/jpeg',
        base64: base64,
        dataUrl: `data:image/jpeg;base64,${base64}`
      });
    }
  }
  res.status(404).json({ error: 'Reference image not found' });
});

// 1. Generate Video with Veo
app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, image, aspectRatio = '16:9', resolution = '720p', model = 'veo-3.1-fast-generate-preview' } = req.body;
    
    const validAspectRatio = (aspectRatio === '9:16') ? '9:16' : '16:9';
    const validResolution = (resolution === '1080p') ? '1080p' : '720p';
    const modelToUse = model || 'veo-3.1-fast-generate-preview';
    
    const payload = {
      model: modelToUse,
      prompt: prompt || 'Cinematic premium fashion editorial video with subtle realistic movement and smooth slow camera push-in',
      config: {
        numberOfVideos: 1,
        resolution: validResolution,
        aspectRatio: validAspectRatio,
      }
    };

    if (image && image.imageBytes) {
      let cleanBytes = image.imageBytes;
      if (cleanBytes.includes('base64,')) {
        cleanBytes = cleanBytes.split('base64,')[1];
      }
      payload.image = {
        imageBytes: cleanBytes,
        mimeType: image.mimeType || 'image/jpeg'
      };
    }

    console.log(`Starting Veo video generation with model: ${modelToUse}, aspect: ${validAspectRatio}`);
    const operation = await ai.models.generateVideos(payload);
    res.json({ operationName: operation.name });
  } catch (error) {
    console.error('Video generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to start video generation' });
  }
});

// 2. Poll Video Operation Status
app.post('/api/video-status', async (req, res) => {
  try {
    const { operationName } = req.body;
    if (!operationName) {
      return res.status(400).json({ error: 'Operation name is required' });
    }
    const op = new GenerateVideosOperation();
    op.name = operationName;
    const updated = await ai.operations.getVideosOperation({ operation: op });
    res.json({ 
      done: Boolean(updated.done),
      error: updated.error || null,
      response: updated.response || null
    });
  } catch (error) {
    console.error('Video status check error:', error);
    res.status(500).json({ error: error.message || 'Failed to check video status' });
  }
});

// 3. Download/Stream Generated Video
app.post('/api/video-download', async (req, res) => {
  try {
    const { operationName } = req.body;
    if (!operationName) {
      return res.status(400).json({ error: 'Operation name is required' });
    }
    const op = new GenerateVideosOperation();
    op.name = operationName;
    const updated = await ai.operations.getVideosOperation({ operation: op });
    
    if (!updated.done) {
      return res.status(400).json({ error: 'Video generation is still in progress' });
    }
    
    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      return res.status(404).json({ error: 'Video URI not found' });
    }
    
    const apiKey = process.env.GEMINI_API_KEY;
    const videoRes = await fetch(uri, {
      headers: { 'x-goog-api-key': apiKey },
    });
    
    if (!videoRes.ok) {
      throw new Error(`Failed to fetch video stream from URI: ${videoRes.statusText}`);
    }
    
    res.setHeader('Content-Type', 'video/mp4');
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    console.error('Video download error:', error);
    res.status(500).json({ error: error.message || 'Failed to stream video' });
  }
});

// Serve static assets from root & src
app.use(express.static(__dirname));
app.use('/src', express.static(path.join(__dirname, 'src')));

// Brand info route
app.get('/brand-information.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'brand-information.html'));
});

// SPA fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`STILL server running on http://0.0.0.0:${PORT}`);
});
