// =============================================================================
// CATÁLOGO DE RITUAIS (Taumaturgia e Necromancia)
//
// Arquivo local do projeto: nada é buscado na internet.
// Traz nome, nível, parada e um resumo curto do efeito, escrito para esta ficha.
// Os textos completos das regras estão nos livros — use este catálogo como
// atalho para preencher o Grimório e ajuste o que a sua mesa combinar.
// =============================================================================

const RITUAIS_DATA = [
  // ---------------------------------------------------------------------------
  // TAUMATURGIA — NÍVEL 1
  // ---------------------------------------------------------------------------
  { escola: 'Taumaturgia', nivel: 1, nome: 'Defesa do Refúgio Sagrado', efeito: 'Protege o refúgio: quem entrar sem convite sofre as consequências do círculo preparado.' },
  { escola: 'Taumaturgia', nivel: 1, nome: 'Sentinela de Sangue', efeito: 'Uma gota de vitae vigia um lugar e avisa o conjurador quando alguém passa por ali.' },
  { escola: 'Taumaturgia', nivel: 1, nome: 'Tinta de Sangue', efeito: 'Escreve com o próprio sangue textos que só outro taumaturgo consegue ler.' },
  { escola: 'Taumaturgia', nivel: 1, nome: 'Purificação da Carne Impura', efeito: 'Expulsa venenos e drogas do corpo do vampiro, ao custo de sangue.' },
  { escola: 'Taumaturgia', nivel: 1, nome: 'Toque do Devoto', efeito: 'Marca um objeto com a assinatura mística do conjurador.' },
  { escola: 'Taumaturgia', nivel: 1, nome: 'Círculo de Proteção', efeito: 'Desenha um círculo que barra criaturas específicas enquanto durar a noite.' },
  { escola: 'Taumaturgia', nivel: 1, nome: 'Aroma do Sangue Alheio', efeito: 'Revela a geração e o clã aproximados de uma amostra de vitae.' },
  { escola: 'Taumaturgia', nivel: 1, nome: 'Passos Silenciosos', efeito: 'Abafa completamente os sons dos passos do conjurador por uma cena.' },

  // ---------------------------------------------------------------------------
  // TAUMATURGIA — NÍVEL 2
  // ---------------------------------------------------------------------------
  { escola: 'Taumaturgia', nivel: 2, nome: 'Passagem Selada', efeito: 'Tranca uma porta ou entrada com selo místico difícil de romper.' },
  { escola: 'Taumaturgia', nivel: 2, nome: 'Olhos da Serpente', efeito: 'O olhar do conjurador prende quem o encarar até o fim do turno.' },
  { escola: 'Taumaturgia', nivel: 2, nome: 'Ampulheta de Sangue', efeito: 'Marca a passagem do tempo restante até o amanhecer com precisão mística.' },
  { escola: 'Taumaturgia', nivel: 2, nome: 'Comunhão com a Vitae', efeito: 'Permite sentir, à distância, quem bebeu do sangue do conjurador.' },
  { escola: 'Taumaturgia', nivel: 2, nome: 'Dedo Acusador', efeito: 'Aponta, entre vários suspeitos, quem tocou determinado objeto.' },
  { escola: 'Taumaturgia', nivel: 2, nome: 'Vinho da Fortaleza', efeito: 'Prepara uma dose de vitae que concede resistência extra a quem beber.' },

  // ---------------------------------------------------------------------------
  // TAUMATURGIA — NÍVEL 3
  // ---------------------------------------------------------------------------
  { escola: 'Taumaturgia', nivel: 3, nome: 'Transferência Sanguínea', efeito: 'Move sangue de um recipiente ou corpo para outro sem contato direto.' },
  { escola: 'Taumaturgia', nivel: 3, nome: 'Clarividência do Sangue', efeito: 'Mostra ao conjurador o que a vitae testemunhou antes de ser derramada.' },
  { escola: 'Taumaturgia', nivel: 3, nome: 'Pacto de Escrita', efeito: 'Um contrato assinado com sangue cobra as consequências de quem o quebrar.' },
  { escola: 'Taumaturgia', nivel: 3, nome: 'Incorporeidade do Refúgio', efeito: 'Esconde o refúgio de buscas místicas e mundanas por uma noite.' },
  { escola: 'Taumaturgia', nivel: 3, nome: 'Cinzas Reveladoras', efeito: 'Revela a presença recente de Kindred num local por meio de cinzas preparadas.' },
  { escola: 'Taumaturgia', nivel: 3, nome: 'Fôlego da Terra', efeito: 'Permite ao conjurador descansar sob o solo sem gastar sangue extra.' },

  // ---------------------------------------------------------------------------
  // TAUMATURGIA — NÍVEL 4
  // ---------------------------------------------------------------------------
  { escola: 'Taumaturgia', nivel: 4, nome: 'Bênção do Sangue Antigo', efeito: 'Trata uma dose de vitae como se viesse de uma geração mais baixa, por pouco tempo.' },
  { escola: 'Taumaturgia', nivel: 4, nome: 'Prisão de Vitae', efeito: 'Aprisiona uma criatura dentro de um círculo desenhado com sangue.' },
  { escola: 'Taumaturgia', nivel: 4, nome: 'Vigilância do Conselho', efeito: 'Permite acompanhar à distância um lugar preparado previamente.' },
  { escola: 'Taumaturgia', nivel: 4, nome: 'Guardião de Cinzas', efeito: 'Cria um servo temporário feito de cinzas e sangue para proteger um local.' },
  { escola: 'Taumaturgia', nivel: 4, nome: 'Máscara de Mil Faces', efeito: 'Altera a aparência do conjurador aos olhos de quem o observa por uma noite.' },

  // ---------------------------------------------------------------------------
  // TAUMATURGIA — NÍVEL 5
  // ---------------------------------------------------------------------------
  { escola: 'Taumaturgia', nivel: 5, nome: 'Sangue Ancestral', efeito: 'Desperta na vitae as memórias e a potência de gerações anteriores.' },
  { escola: 'Taumaturgia', nivel: 5, nome: 'Cárcere de Tormento', efeito: 'Prende a alma de uma vítima em sofrimento até que o selo seja rompido.' },
  { escola: 'Taumaturgia', nivel: 5, nome: 'Chamado do Sangue Distante', efeito: 'Convoca à presença do conjurador alguém ligado a ele por vínculo de sangue.' },
  { escola: 'Taumaturgia', nivel: 5, nome: 'Selo do Trono', efeito: 'Protege um lugar inteiro contra intrusões místicas durante dias.' },
  { escola: 'Taumaturgia', nivel: 5, nome: 'Renovação do Pacto', efeito: 'Reforça um laço de sangue existente, tornando-o mais difícil de romper.' },

  // ---------------------------------------------------------------------------
  // NECROMANCIA — NÍVEL 1
  // ---------------------------------------------------------------------------
  { escola: 'Necromancia', nivel: 1, nome: 'Chamado dos Mortos', efeito: 'Atrai fantasmas das redondezas para perto do conjurador.' },
  { escola: 'Necromancia', nivel: 1, nome: 'Olhos do Mortalha', efeito: 'Permite enxergar sinais da Mortalha por uma cena.' },
  { escola: 'Necromancia', nivel: 1, nome: 'Vela dos Mortos', efeito: 'Uma vela preparada revela a presença de espíritos próximos.' },
  { escola: 'Necromancia', nivel: 1, nome: 'Marca do Túmulo', efeito: 'Marca um corpo para que outros necromantes o reconheçam.' },
  { escola: 'Necromancia', nivel: 1, nome: 'Sussurro Fúnebre', efeito: 'Permite uma pergunta curta a um morto recente.' },

  // ---------------------------------------------------------------------------
  // NECROMANCIA — NÍVEL 2
  // ---------------------------------------------------------------------------
  { escola: 'Necromancia', nivel: 2, nome: 'Pedido ao Defunto', efeito: 'Obriga um espírito a cumprir uma tarefa simples.' },
  { escola: 'Necromancia', nivel: 2, nome: 'Âncora Quebrada', efeito: 'Desfaz o vínculo que prende um fantasma a um objeto ou lugar.' },
  { escola: 'Necromancia', nivel: 2, nome: 'Mortalha Cerrada', efeito: 'Dificulta a passagem de espíritos por um local durante a noite.' },
  { escola: 'Necromancia', nivel: 2, nome: 'Vestígio do Falecido', efeito: 'Mostra como e quando um corpo morreu.' },

  // ---------------------------------------------------------------------------
  // NECROMANCIA — NÍVEL 3
  // ---------------------------------------------------------------------------
  { escola: 'Necromancia', nivel: 3, nome: 'Servo de Ossos', efeito: 'Ergue um cadáver como servo obediente por algumas noites.' },
  { escola: 'Necromancia', nivel: 3, nome: 'Corda de Prata', efeito: 'Segue o rastro espiritual de alguém que passou pelo local.' },
  { escola: 'Necromancia', nivel: 3, nome: 'Frio do Sepulcro', efeito: 'Baixa a temperatura de uma sala e enfraquece quem estiver ali.' },
  { escola: 'Necromancia', nivel: 3, nome: 'Máscara Cadavérica', efeito: 'Dá ao conjurador a aparência de um cadáver, enganando os vivos.' },

  // ---------------------------------------------------------------------------
  // NECROMANCIA — NÍVEL 4
  // ---------------------------------------------------------------------------
  { escola: 'Necromancia', nivel: 4, nome: 'Prisão de Alma', efeito: 'Aprisiona um espírito dentro de um objeto preparado.' },
  { escola: 'Necromancia', nivel: 4, nome: 'Corte na Mortalha', efeito: 'Abre uma passagem temporária entre os mundos.' },
  { escola: 'Necromancia', nivel: 4, nome: 'Legião de Cinzas', efeito: 'Levanta vários corpos ao mesmo tempo para uma única ordem.' },

  // ---------------------------------------------------------------------------
  // NECROMANCIA — NÍVEL 5
  // ---------------------------------------------------------------------------
  { escola: 'Necromancia', nivel: 5, nome: 'Juramento dos Mortos', efeito: 'Vincula um espírito poderoso ao serviço do conjurador.' },
  { escola: 'Necromancia', nivel: 5, nome: 'Vigília Eterna', efeito: 'Mantém um cadáver preservado e desperto por tempo indefinido.' },
  { escola: 'Necromancia', nivel: 5, nome: 'Porta do Além', efeito: 'Permite ao conjurador atravessar pessoalmente para o lado dos mortos.' }
];

if (typeof window !== 'undefined') window.RITUAIS_DATA = RITUAIS_DATA;
