import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Product } from '../../database/entities/product.entity';
import { Settings } from '../../database/entities/settings.entity';
import { AssistantService, extractAssistantText } from './assistant.service';

describe('AssistantService', () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([{ category: 'Switches' }]),
    getMany: jest.fn().mockResolvedValue([{
      name: 'SRV Switch', sub: '6A', category: 'Switches', sku: 'SW-6',
      price: 99, points: 2, stock: 10, description: 'White modular switch',
    }]),
  };
  const products = { createQueryBuilder: jest.fn().mockReturnValue(query) } as unknown as Repository<Product>;
  const settings = { findOneBy: jest.fn().mockResolvedValue({ value: '918837684004' }) } as unknown as Repository<Settings>;
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('extracts only assistant message text from a Responses result', () => {
    expect(extractAssistantText([
      { type: 'reasoning', content: [{ type: 'output_text', text: 'private' }] },
      { type: 'message', content: [{ type: 'output_text', text: 'Hello from SRV' }] },
    ])).toBe('Hello from SRV');
  });

  it('explains setup when the server has no API key', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const service = new AssistantService(config, products, settings);
    await expect(service.chat({ message: 'Hello' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(products.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('keeps QR support focused on verified support data', async () => {
    const config = { get: jest.fn((key: string) => key === 'OPENAI_API_KEY' ? 'test-key' : undefined) } as unknown as ConfigService;
    const service = new AssistantService(config, products, settings);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Please send the QR photos to SRV support.' }] }],
    }) });
    global.fetch = fetchMock as typeof fetch;

    const result = await service.chat({ message: 'My SRV switch QR will not scan', language: 'Punjabi' });
    expect(result).toEqual({ reply: 'Please send the QR photos to SRV support.', supportWhatsApp: '918837684004' });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.instructions).toContain('918837684004');
    expect(request.instructions).not.toContain('SW-6');
    expect(request.instructions).toContain('Punjabi');
    expect(request.store).toBe(false);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
  });

  it('prefers free Groq chat without sending catalog data for QR help', async () => {
    const config = { get: jest.fn((key: string) => ({ GROQ_API_KEY: 'groq-test', OPENAI_API_KEY: 'openai-test' })[key]) } as unknown as ConfigService;
    const service = new AssistantService(config, products, settings);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      choices: [{ message: { content: 'Please send clear QR photos to SRV support.' } }],
    }) });
    global.fetch = fetchMock as typeof fetch;

    const result = await service.chat({ message: 'My QR will not scan', language: 'Hindi' });
    expect(result.reply).toContain('QR photos');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.model).toBe('openai/gpt-oss-120b');
    expect(request.messages[0].content).toContain('918837684004');
    expect(request.messages[0].content).not.toContain('SW-6');
    expect(request.messages[0].content).toContain('Hindi');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer groq-test');
  });

  it('includes catalog matches for Groq only when catalog egress is enabled', async () => {
    const config = { get: jest.fn((key: string) => ({
      GROQ_API_KEY: 'groq-test', GROQ_CATALOG_EGRESS: 'true',
    })[key]) } as unknown as ConfigService;
    const service = new AssistantService(config, products, settings);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      choices: [{ message: { content: 'The SRV Switch is in the catalog.' } }],
    }) });
    global.fetch = fetchMock as typeof fetch;

    await service.chat({ message: 'What SRV switch products are available?' });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.messages[0].content).toContain('SW-6');
    expect(request.messages[0].content).toContain('Switches');
  });

  it('answers product questions from the local catalog without sending data to Groq before approval', async () => {
    const config = { get: jest.fn((key: string) => key === 'GROQ_API_KEY' ? 'groq-test' : undefined) } as unknown as ConfigService;
    const service = new AssistantService(config, products, settings);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      choices: [{ message: { content: 'I cannot confirm a product detail yet.' } }],
    }) });
    global.fetch = fetchMock as typeof fetch;

    const result = await service.chat({ message: 'What SRV switch products are available?' });
    expect(result.reply).toContain('SW-6');
    expect(result.reply).toContain('Switches');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends recorded audio to Groq Whisper when Groq is configured', async () => {
    const config = { get: jest.fn((key: string) => key === 'GROQ_API_KEY' ? 'groq-test' : undefined) } as unknown as ConfigService;
    const service = new AssistantService(config, products, settings);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ' }) });
    global.fetch = fetchMock as typeof fetch;

    const result = await service.transcribe({ buffer: Buffer.from('audio'), originalname: 'voice.m4a', mimetype: 'audio/mp4' } as Express.Multer.File);
    expect(result.text).toBe('ਸਤ ਸ੍ਰੀ ਅਕਾਲ');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect((fetchMock.mock.calls[0][1].body as FormData).get('model')).toBe('whisper-large-v3-turbo');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer groq-test');
  });
});
