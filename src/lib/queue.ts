import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL;

export let connection: any = undefined;
export let mailQueue: any;

if (redisUrl && redisUrl !== 'none' && redisUrl !== 'local') {
  try {
    const parsedUrl = new URL(redisUrl);
    connection = {
      host: parsedUrl.hostname || 'localhost',
      port: parseInt(parsedUrl.port || '6379', 10),
      username: parsedUrl.username || undefined,
      password: parsedUrl.password || undefined,
      maxRetriesPerRequest: null, // Obrigatório para BullMQ
    };

    mailQueue = new Queue('mail-queue', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  } catch (error) {
    console.error('Falha ao conectar no Redis, usando Mock Queue:', error);
    setupMockQueue();
  }
} else {
  setupMockQueue();
}

function setupMockQueue() {
  mailQueue = {
    add: async (name: string, data: any) => {
      console.log(`[Mock Queue] Adicionando job: ${name}`);
      return { id: 'mock-job-id' };
    },
    addBulk: async (jobs: any[]) => {
      console.log(`[Mock Queue] Adicionando ${jobs.length} jobs em lote`);
      return jobs.map((j, i) => ({ id: `mock-job-${i}` }));
    }
  };
}
