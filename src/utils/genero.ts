// Rótulos de gênero e data de nascimento para as planilhas exportadas
// (ExportOrdersDialog). Espelho de supabase/functions/_shared/genero.ts — os dois
// precisam dar o mesmo texto para a mesma linha do banco.
//
// `clients.gender` é texto livre vindo dos integradores: 'male'/'female',
// 'Masculino'/'Feminino', 'M'/'F', 'I', vazio. A régua é a MESMA da função SQL
// `genero_norm` (dashboard e filtros): só a primeira letra conta — 'm' é
// masculino, 'f' é feminino, qualquer outra coisa é "não informado" e sai em
// branco na planilha (não se inventa rótulo para 'I').
export function rotuloGenero(gender: string | null | undefined): string {
  const inicial = String(gender ?? '').trim().charAt(0).toLowerCase();
  if (inicial === 'm') return 'Masculino';
  if (inicial === 'f') return 'Feminino';
  return '';
}

/** `clients.birthdate` (DATE, 'AAAA-MM-DD') → 'DD/MM/AAAA'; vazio se nulo ou fora do formato. */
export function dataNascimentoBr(birthdate: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthdate ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
