import { redisConnection } from './redis-connection.js';

describe('redisConnection', () => {
  it('lê host e porta', () => {
    expect(redisConnection('redis://localhost:6380')).toMatchObject({
      host: 'localhost',
      port: 6380,
    });
  });

  it('usa a porta padrão e lê credenciais, banco e TLS', () => {
    expect(redisConnection('rediss://u:p@redis.example.com/2')).toEqual({
      host: 'redis.example.com',
      port: 6379,
      username: 'u',
      password: 'p',
      db: 2,
      tls: {},
    });
  });
});
