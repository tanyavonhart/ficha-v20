// =============================================================================
// CATÁLOGO DE FEITIÇOS (poderes das Trilhas de Taumaturgia e Necromancia)
//
// Arquivo local do projeto: nada é buscado na internet.
// Cada entrada traz a trilha, o nível, a parada sugerida e um resumo curto.
// A dificuldade padrão dos poderes de trilha costuma ser 3 + nível; ajuste
// conforme a sua mesa e o livro.
// =============================================================================

const FEITICOS_DATA = [
  // ===========================================================================
  // TAUMATURGIA
  // ===========================================================================
  { escola: 'Taumaturgia', trilha: 'Trilha do Sangue', nivel: 1, nome: 'Gosto de Sangue', efeito: 'Provando uma gota, descobre quanta vitae a criatura tem e se está enfeitiçada.' },
  { escola: 'Taumaturgia', trilha: 'Trilha do Sangue', nivel: 2, nome: 'Força do Sangue Fraco', efeito: 'Diluí temporariamente a potência do sangue de outro vampiro.' },
  { escola: 'Taumaturgia', trilha: 'Trilha do Sangue', nivel: 3, nome: 'Roubo de Vitae', efeito: 'Puxa sangue da vítima à distância direto para o conjurador.' },
  { escola: 'Taumaturgia', trilha: 'Trilha do Sangue', nivel: 4, nome: 'Caldeirão de Sangue', efeito: 'Ferve o sangue dentro da vítima, causando dano agravado.' },
  { escola: 'Taumaturgia', trilha: 'Trilha do Sangue', nivel: 5, nome: 'Feitiço da Vitae Alheia', efeito: 'Domina a vitae de outro Kindred como se fosse a própria.' },

  { escola: 'Taumaturgia', trilha: 'Sedução das Chamas', nivel: 1, nome: 'Palma Flamejante', efeito: 'Acende uma chama do tamanho de uma vela na mão do conjurador.' },
  { escola: 'Taumaturgia', trilha: 'Sedução das Chamas', nivel: 2, nome: 'Fogo de Tocha', efeito: 'Cria uma chama maior, capaz de incendiar objetos próximos.' },
  { escola: 'Taumaturgia', trilha: 'Sedução das Chamas', nivel: 3, nome: 'Fogueira', efeito: 'Levanta uma fogueira ardente a poucos metros de distância.' },
  { escola: 'Taumaturgia', trilha: 'Sedução das Chamas', nivel: 4, nome: 'Parede de Chamas', efeito: 'Ergue uma barreira de fogo que separa o campo de batalha.' },
  { escola: 'Taumaturgia', trilha: 'Sedução das Chamas', nivel: 5, nome: 'Inferno', efeito: 'Envolve uma área inteira em chamas devastadoras.' },

  { escola: 'Taumaturgia', trilha: 'Movimento da Mente', nivel: 1, nome: 'Toque Invisível', efeito: 'Move objetos pequenos à distância, como empurrar um copo.' },
  { escola: 'Taumaturgia', trilha: 'Movimento da Mente', nivel: 2, nome: 'Mãos Distantes', efeito: 'Levanta e manipula objetos de até alguns quilos.' },
  { escola: 'Taumaturgia', trilha: 'Movimento da Mente', nivel: 3, nome: 'Arremesso', efeito: 'Lança objetos contra alvos, causando dano pelo peso.' },
  { escola: 'Taumaturgia', trilha: 'Movimento da Mente', nivel: 4, nome: 'Suspensão', efeito: 'Suspende no ar uma pessoa ou um corpo pesado.' },
  { escola: 'Taumaturgia', trilha: 'Movimento da Mente', nivel: 5, nome: 'Voo da Mente', efeito: 'Levanta o próprio conjurador e o move pelo ar.' },

  { escola: 'Taumaturgia', trilha: 'Mãos da Destruição', nivel: 1, nome: 'Decrepitude', efeito: 'Envelhece e enfraquece um objeto pequeno com o toque.' },
  { escola: 'Taumaturgia', trilha: 'Mãos da Destruição', nivel: 2, nome: 'Apodrecer', efeito: 'Corrói matéria orgânica, estragando comida, madeira ou tecido.' },
  { escola: 'Taumaturgia', trilha: 'Mãos da Destruição', nivel: 3, nome: 'Toque Necrótico', efeito: 'Causa ferimentos que não cicatrizam com facilidade.' },
  { escola: 'Taumaturgia', trilha: 'Mãos da Destruição', nivel: 4, nome: 'Ferrugem', efeito: 'Destrói metal e estruturas em segundos.' },
  { escola: 'Taumaturgia', trilha: 'Mãos da Destruição', nivel: 5, nome: 'Desfazer a Carne', efeito: 'Reduz um corpo vivo a ruína, com dano agravado.' },

  { escola: 'Taumaturgia', trilha: 'Domínio Elemental', nivel: 1, nome: 'Ecoar as Forças', efeito: 'Sente a presença e a natureza dos elementos ao redor.' },
  { escola: 'Taumaturgia', trilha: 'Domínio Elemental', nivel: 2, nome: 'Toque Elemental', efeito: 'Aquece, resfria ou endurece a matéria tocada.' },
  { escola: 'Taumaturgia', trilha: 'Domínio Elemental', nivel: 3, nome: 'Força Elemental', efeito: 'Dobra e move grandes quantidades de terra, água ou ar.' },
  { escola: 'Taumaturgia', trilha: 'Domínio Elemental', nivel: 4, nome: 'Servo de Pedra', efeito: 'Anima um objeto ou massa elemental como servo temporário.' },
  { escola: 'Taumaturgia', trilha: 'Domínio Elemental', nivel: 5, nome: 'Fúria dos Elementos', efeito: 'Desencadeia uma tempestade elemental na região.' },

  { escola: 'Taumaturgia', trilha: 'Senhorio de Netuno', nivel: 1, nome: 'Águas Calmas', efeito: 'Acalma ou agita a água em pequena escala.' },
  { escola: 'Taumaturgia', trilha: 'Senhorio de Netuno', nivel: 2, nome: 'Purificar as Águas', efeito: 'Limpa ou envenena um volume de água.' },
  { escola: 'Taumaturgia', trilha: 'Senhorio de Netuno', nivel: 3, nome: 'Prisão Líquida', efeito: 'Prende alguém numa massa de água que não solta.' },
  { escola: 'Taumaturgia', trilha: 'Senhorio de Netuno', nivel: 4, nome: 'Fluxo Sangrento', efeito: 'Manipula o sangue derramado como se fosse água.' },
  { escola: 'Taumaturgia', trilha: 'Senhorio de Netuno', nivel: 5, nome: 'Maré Furiosa', efeito: 'Levanta ondas e correntes capazes de arrastar veículos.' },

  { escola: 'Taumaturgia', trilha: 'Controle do Clima', nivel: 1, nome: 'Brisa', efeito: 'Levanta ou acalma um vento leve.' },
  { escola: 'Taumaturgia', trilha: 'Controle do Clima', nivel: 2, nome: 'Névoa', efeito: 'Cobre a área com neblina densa.' },
  { escola: 'Taumaturgia', trilha: 'Controle do Clima', nivel: 3, nome: 'Chuva', efeito: 'Traz uma chuva forte sobre a região.' },
  { escola: 'Taumaturgia', trilha: 'Controle do Clima', nivel: 4, nome: 'Tempestade', efeito: 'Desencadeia trovões, raios e ventania.' },
  { escola: 'Taumaturgia', trilha: 'Controle do Clima', nivel: 5, nome: 'Fúria do Céu', efeito: 'Guia o raio contra um alvo específico.' },

  { escola: 'Taumaturgia', trilha: 'Senda da Conjuração', nivel: 1, nome: 'Objeto Simples', efeito: 'Cria um objeto pequeno e sem partes móveis.' },
  { escola: 'Taumaturgia', trilha: 'Senda da Conjuração', nivel: 2, nome: 'Objeto Trabalhado', efeito: 'Conjura objetos com detalhes e mecanismos simples.' },
  { escola: 'Taumaturgia', trilha: 'Senda da Conjuração', nivel: 3, nome: 'Objeto à Distância', efeito: 'Faz o objeto surgir longe das mãos do conjurador.' },
  { escola: 'Taumaturgia', trilha: 'Senda da Conjuração', nivel: 4, nome: 'Permanência', efeito: 'O objeto conjurado dura muito além da cena.' },
  { escola: 'Taumaturgia', trilha: 'Senda da Conjuração', nivel: 5, nome: 'Mão do Artesão', efeito: 'Cria objetos complexos, inclusive com peças móveis.' },

  { escola: 'Taumaturgia', trilha: 'Caminho Verde', nivel: 1, nome: 'Herbologia', efeito: 'Identifica plantas e seus usos ao toque.' },
  { escola: 'Taumaturgia', trilha: 'Caminho Verde', nivel: 2, nome: 'Crescimento Acelerado', efeito: 'Faz plantas crescerem em minutos.' },
  { escola: 'Taumaturgia', trilha: 'Caminho Verde', nivel: 3, nome: 'Raízes Prendedoras', efeito: 'Galhos e raízes agarram quem se aproxima.' },
  { escola: 'Taumaturgia', trilha: 'Caminho Verde', nivel: 4, nome: 'Guardião de Folhas', efeito: 'Anima uma planta grande como defensora.' },
  { escola: 'Taumaturgia', trilha: 'Caminho Verde', nivel: 5, nome: 'Fúria da Mata', efeito: 'Toda a vegetação da região se volta contra os invasores.' },

  { escola: 'Taumaturgia', trilha: 'Senda da Corrupção', nivel: 1, nome: 'Contradizer', efeito: 'Planta uma dúvida na mente da vítima.' },
  { escola: 'Taumaturgia', trilha: 'Senda da Corrupção', nivel: 2, nome: 'Sussurro Insidioso', efeito: 'Faz a vítima duvidar de um aliado próximo.' },
  { escola: 'Taumaturgia', trilha: 'Senda da Corrupção', nivel: 3, nome: 'Semear a Discórdia', efeito: 'Transforma uma desconfiança em briga aberta.' },
  { escola: 'Taumaturgia', trilha: 'Senda da Corrupção', nivel: 4, nome: 'Trair o Próprio Sangue', efeito: 'Leva a vítima a agir contra quem mais preza.' },
  { escola: 'Taumaturgia', trilha: 'Senda da Corrupção', nivel: 5, nome: 'Ruína da Alma', efeito: 'Corrói a Humanidade ou a Trilha da vítima.' },

  { escola: 'Taumaturgia', trilha: 'Senda de Marte', nivel: 1, nome: 'Grito de Guerra', efeito: 'Inspira coragem em aliados no início do combate.' },
  { escola: 'Taumaturgia', trilha: 'Senda de Marte', nivel: 2, nome: 'Arma Abençoada', efeito: 'Aumenta o dano de uma arma por uma cena.' },
  { escola: 'Taumaturgia', trilha: 'Senda de Marte', nivel: 3, nome: 'Formação de Batalha', efeito: 'Coordena o grupo, melhorando a iniciativa de todos.' },
  { escola: 'Taumaturgia', trilha: 'Senda de Marte', nivel: 4, nome: 'Fúria do Comandante', efeito: 'Concede uma ação extra aos aliados em combate.' },
  { escola: 'Taumaturgia', trilha: 'Senda de Marte', nivel: 5, nome: 'Senhor da Guerra', efeito: 'O campo de batalha inteiro responde às ordens do conjurador.' },

  { escola: 'Taumaturgia', trilha: 'Manipulação Espiritual', nivel: 1, nome: 'Olhar Além', efeito: 'Enxerga o mundo dos espíritos por uma cena.' },
  { escola: 'Taumaturgia', trilha: 'Manipulação Espiritual', nivel: 2, nome: 'Voz do Outro Lado', efeito: 'Conversa com espíritos próximos.' },
  { escola: 'Taumaturgia', trilha: 'Manipulação Espiritual', nivel: 3, nome: 'Tocar o Invisível', efeito: 'Permite atingir e ser atingido por espíritos.' },
  { escola: 'Taumaturgia', trilha: 'Manipulação Espiritual', nivel: 4, nome: 'Amarrar o Espírito', efeito: 'Prende um espírito a um lugar ou objeto.' },
  { escola: 'Taumaturgia', trilha: 'Manipulação Espiritual', nivel: 5, nome: 'Atravessar o Véu', efeito: 'Leva o conjurador para o outro lado da barreira espiritual.' },

  // ===========================================================================
  // NECROMANCIA
  // ===========================================================================
  { escola: 'Necromancia', trilha: 'Trilha do Sepulcro', nivel: 1, nome: 'Visão do Espírito', efeito: 'Enxerga fantasmas e vestígios da morte ao redor.' },
  { escola: 'Necromancia', trilha: 'Trilha do Sepulcro', nivel: 2, nome: 'Chamado do Além', efeito: 'Convoca um espírito específico para conversar.' },
  { escola: 'Necromancia', trilha: 'Trilha do Sepulcro', nivel: 3, nome: 'Toque do Túmulo', efeito: 'Permite tocar e ferir espíritos com as próprias mãos.' },
  { escola: 'Necromancia', trilha: 'Trilha do Sepulcro', nivel: 4, nome: 'Grilhões da Alma', efeito: 'Obriga um espírito a obedecer por um tempo.' },
  { escola: 'Necromancia', trilha: 'Trilha do Sepulcro', nivel: 5, nome: 'Aprisionar a Alma', efeito: 'Arranca e aprisiona a alma de uma vítima.' },

  { escola: 'Necromancia', trilha: 'Trilha dos Ossos', nivel: 1, nome: 'Aparência de Cadáver', efeito: 'Dá ao conjurador a palidez e o frio de um morto.' },
  { escola: 'Necromancia', trilha: 'Trilha dos Ossos', nivel: 2, nome: 'Toque do Sepulcro', efeito: 'Drena a vitalidade de um mortal com o toque.' },
  { escola: 'Necromancia', trilha: 'Trilha dos Ossos', nivel: 3, nome: 'Roubo de Fôlego', efeito: 'Sufoca a vítima arrancando o ar dos pulmões.' },
  { escola: 'Necromancia', trilha: 'Trilha dos Ossos', nivel: 4, nome: 'Servo Cadavérico', efeito: 'Ergue um corpo para servir por algumas noites.' },
  { escola: 'Necromancia', trilha: 'Trilha dos Ossos', nivel: 5, nome: 'Anúncio da Morte', efeito: 'Mata um mortal com o toque, se ele falhar em resistir.' },

  { escola: 'Necromancia', trilha: 'Trilha das Cinzas', nivel: 1, nome: 'Olhar Cinzento', efeito: 'Vê através da barreira que separa vivos e mortos.' },
  { escola: 'Necromancia', trilha: 'Trilha das Cinzas', nivel: 2, nome: 'Chamado da Fumaça', efeito: 'Atrai espíritos errantes para perto.' },
  { escola: 'Necromancia', trilha: 'Trilha das Cinzas', nivel: 3, nome: 'Mão na Mortalha', efeito: 'Empurra e puxa objetos do lado espiritual.' },
  { escola: 'Necromancia', trilha: 'Trilha das Cinzas', nivel: 4, nome: 'Rasgo na Mortalha', efeito: 'Abre uma fenda temporária entre os mundos.' },
  { escola: 'Necromancia', trilha: 'Trilha das Cinzas', nivel: 5, nome: 'Passagem das Cinzas', efeito: 'Atravessa pessoalmente para o lado dos mortos.' },

  { escola: 'Necromancia', trilha: 'Trilha do Cenotáfio', nivel: 1, nome: 'Sentir a Âncora', efeito: 'Descobre a que objeto ou lugar um fantasma está preso.' },
  { escola: 'Necromancia', trilha: 'Trilha do Cenotáfio', nivel: 2, nome: 'Tocar a Âncora', efeito: 'Manipula a âncora para atrair ou afastar o espírito.' },
  { escola: 'Necromancia', trilha: 'Trilha do Cenotáfio', nivel: 3, nome: 'Prender à Âncora', efeito: 'Amarra o espírito a um objeto escolhido.' },
  { escola: 'Necromancia', trilha: 'Trilha do Cenotáfio', nivel: 4, nome: 'Âncora Viva', efeito: 'Usa uma pessoa como âncora do espírito.' },
  { escola: 'Necromancia', trilha: 'Trilha do Cenotáfio', nivel: 5, nome: 'Romper a Âncora', efeito: 'Destrói a âncora e lança o espírito à deriva.' },

  { escola: 'Necromancia', trilha: 'Trilha Vítrea', nivel: 1, nome: 'Olhos de Vidro', efeito: 'Espia pelos olhos de um cadáver.' },
  { escola: 'Necromancia', trilha: 'Trilha Vítrea', nivel: 2, nome: 'Ouvir os Mortos', efeito: 'Escuta o que os mortos próximos comentam.' },
  { escola: 'Necromancia', trilha: 'Trilha Vítrea', nivel: 3, nome: 'Pele de Sudário', efeito: 'Torna a pele resistente como a de um afogado.' },
  { escola: 'Necromancia', trilha: 'Trilha Vítrea', nivel: 4, nome: 'Corpo Emprestado', efeito: 'Assume o controle de um cadáver a distância.' },
  { escola: 'Necromancia', trilha: 'Trilha Vítrea', nivel: 5, nome: 'Presença Fantasmal', efeito: 'Projeta a própria imagem como um espectro.' }
];

if (typeof window !== 'undefined') window.FEITICOS_DATA = FEITICOS_DATA;
