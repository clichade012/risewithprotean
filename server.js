// ES Modules imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import correlator from 'express-correlation-id';
import cors from 'cors';
import http from 'http';

// Swagger imports
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// Local imports
import { logger as _logger } from './logger/winston.js';
import apiRoutes from './routes/index.js';
import db from './database/db_helper.js';

// ES Modules: Define __dirname (not available in ES modules by default)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const server = http.createServer(app);
const port = process.env.PORT || '3000';

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Protean DevPortal API',
      version: '1.0.0',
      description: 'API documentation for Protean Developer Portal',
    },
    servers: [
      {
        url: `http://localhost:${port}${process.env.BASE_URL}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-access-token',
          description: 'Access token from login response',
        },
        authKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-auth-key',
          description: 'Auth key from login response',
        },
      },
    },
  },
  apis: ['./routes/*.js', './controller/*.js', './swagger/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body parser middleware
app.use(bodyParser.urlencoded({ limit: '50mb', extended: false }));
app.use(bodyParser.json({ limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// CORS
app.use(cors());

// Security
app.disable('x-powered-by');
app.use(helmet.frameguard({ action: 'deny' }));

// Correlation ID middleware
app.use(correlator());

// Swagger UI route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API Routes
app.use(process.env.BASE_URL, apiRoutes({ express }));

// Database initialization
db.initialize().catch((err) => {
  console.error('Failed to connect to the database:', err);
  process.exit(1);
});

db.analytics_db().catch((err) => {
  console.error('Failed to connect to the analytics database:', err);
  process.exit(1);
});

// Redis initialization
if (process.env.REDIS_ENABLED > 0) {
  import('./database/redis_cache.js').then((redisModule) => {
    const redisDB = redisModule.default;
    redisDB.connect().then(() => {
      console.log('Redis cache connected successfully.');
    }).catch((err) => {
      console.error('Failed to connect to the redis cache:', err);
      process.exit(1);
    });
  });
}

// Set port
app.set('port', port);

// Start server
server.listen(port);
console.log('Server listening on port ' + port);
console.log(`Swagger docs available at http://localhost:${port}/api-docs`);

// Error handler
app.use((err, req, res, next) => {
  _logger.error(err.stack);
  res.status(err.status || 500).send(err.stack);
});

// Export app
export default app;
