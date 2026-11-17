import {
  listingChangesSchema,
  listingContentSchema,
  mergeContent,
} from './listing-content.js';
import { aContent } from '../../../../test/support/listing-content.js';

const issuePaths = (input: unknown, schema = listingContentSchema) => {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : [...new Set(result.error.issues.map((i) => i.path[0]))];
};

describe('validação do conteúdo do anúncio', () => {
  it('aceita um conteúdo válido', () => {
    expect(listingContentSchema.safeParse(aContent()).success).toBe(true);
  });

  it('recusa título curto após o trim', () => {
    expect(issuePaths(aContent({ title: '  curto   ' }))).toEqual(['title']);
  });

  it('grava o título sem os espaços das pontas', () => {
    const parsed = listingContentSchema.parse(
      aContent({ title: '   1234567890   ' }),
    );
    expect(parsed.title).toBe('1234567890');
  });

  it('recusa título com mais de 100 caracteres', () => {
    expect(issuePaths(aContent({ title: 'x'.repeat(101) }))).toEqual(['title']);
  });

  it('recusa descrição vazia ou só espaços', () => {
    expect(issuePaths(aContent({ description: '   ' }))).toEqual([
      'description',
    ]);
  });

  it.each([0, -1, 10.5, '100'])('recusa preço %s', (priceCents) => {
    expect(issuePaths({ ...aContent(), priceCents })).toEqual(['priceCents']);
  });

  it('recusa categoria desconhecida', () => {
    expect(issuePaths({ ...aContent(), category: 'animais' })).toEqual([
      'category',
    ]);
  });

  it.each([
    ['vazia', []],
    [
      'mais de 10',
      Array.from({ length: 11 }, (_, i) => `https://x.com/${i}.jpg`),
    ],
    ['com http', ['http://x.com/a.jpg']],
    ['com texto que não é URL', ['nao-e-url']],
  ])('recusa lista de imagens %s', (_, imageUrls) => {
    expect(issuePaths(aContent({ imageUrls }))).toEqual(['imageUrls']);
  });

  it('aceita preço absurdo para a categoria (faixa é da moderação)', () => {
    expect(
      listingContentSchema.safeParse(
        aContent({ category: 'eletronicos', priceCents: 1 }),
      ).success,
    ).toBe(true);
  });
});

describe('edição parcial', () => {
  it('recusa edição sem campos', () => {
    expect(listingChangesSchema.safeParse({}).success).toBe(false);
  });

  it('aceita só o preço e mantém os demais campos ao mesclar', () => {
    const changes = listingChangesSchema.parse({ priceCents: 99_900 });
    expect(mergeContent(aContent(), changes)).toEqual(
      aContent({ priceCents: 99_900 }),
    );
  });

  it('valida o conteúdo mesclado', () => {
    expect(() => mergeContent(aContent(), { title: 'curto' })).toThrow();
  });
});
