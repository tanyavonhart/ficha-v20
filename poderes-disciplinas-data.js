// =============================================================================
// CATÁLOGO DE PODERES DE DISCIPLINA
//
// Arquivo local do projeto: nada é buscado na internet.
// Traz o nome do poder, a Disciplina, o nível, a parada sugerida e um resumo
// curto. Onde não há rolagem, a parada fica vazia (poder automático).
// =============================================================================

const PODERES_DATA = [
  // --- ANIMALISMO -----------------------------------------------------------
  { disciplina: 'Animalismo', nivel: 1, nome: 'Sussurro do Caos', parada: 'Manipulação + Empatia c/ Animais', efeito: 'Fala com um animal e pede favores simples.' },
  { disciplina: 'Animalismo', nivel: 2, nome: 'Chamado Feral', parada: 'Carisma + Sobrevivência', efeito: 'Convoca animais da região para perto.' },
  { disciplina: 'Animalismo', nivel: 3, nome: 'Fôlego do Espírito Selvagem', parada: 'Manipulação + Empatia c/ Animais', efeito: 'Acalma ou enfurece a Besta de outro vampiro.' },
  { disciplina: 'Animalismo', nivel: 4, nome: 'Subjugar a Besta', parada: 'Manipulação + Empatia c/ Animais', efeito: 'Domina a Besta alheia, tirando-a do frenesi ou mergulhando-a nele.' },
  { disciplina: 'Animalismo', nivel: 5, nome: 'Dividir a Mente', parada: 'Manipulação + Empatia c/ Animais', efeito: 'Envia a própria consciência para o corpo de um animal.' },

  // --- AUSPÍCIOS ------------------------------------------------------------
  { disciplina: 'Auspícios', nivel: 1, nome: 'Sentidos Aguçados', parada: 'Percepção + Prontidão', efeito: 'Amplia todos os sentidos por uma cena.' },
  { disciplina: 'Auspícios', nivel: 2, nome: 'Percepção da Aura', parada: 'Percepção + Empatia', efeito: 'Lê a aura de alguém: humor, natureza e sinais de magia.' },
  { disciplina: 'Auspícios', nivel: 3, nome: 'O Toque do Espírito', parada: 'Percepção + Empatia', efeito: 'Lê as impressões deixadas num objeto ou local.' },
  { disciplina: 'Auspícios', nivel: 4, nome: 'Telepatia', parada: 'Inteligência + Subterfúgio', efeito: 'Lê pensamentos superficiais e envia mensagens mentais.' },
  { disciplina: 'Auspícios', nivel: 5, nome: 'Projeção Psíquica', parada: 'Percepção + Ocultismo', efeito: 'Sai do corpo e viaja como presença invisível.' },

  // --- CELERIDADE -----------------------------------------------------------
  { disciplina: 'Celeridade', nivel: 1, nome: 'Velocidade Sobrenatural', parada: '—', efeito: 'Cada ponto gasto soma 1 dado em ações de Destreza e permite ações extras.' },
  { disciplina: 'Celeridade', nivel: 2, nome: 'Reflexos Rápidos', parada: '—', efeito: 'A iniciativa e as esquivas melhoram sensivelmente.' },
  { disciplina: 'Celeridade', nivel: 3, nome: 'Borrão', parada: '—', efeito: 'O vampiro se move rápido demais para ser acompanhado pelos olhos.' },
  { disciplina: 'Celeridade', nivel: 4, nome: 'Torrente de Golpes', parada: '—', efeito: 'Sequência de ataques numa única troca.' },
  { disciplina: 'Celeridade', nivel: 5, nome: 'Fúria Veloz', parada: '—', efeito: 'Age várias vezes antes que os outros consigam reagir.' },

  // --- DOMINAÇÃO ------------------------------------------------------------
  { disciplina: 'Dominação', nivel: 1, nome: 'Comando', parada: 'Manipulação + Intimidação', efeito: 'Uma palavra de ordem que a vítima obedece na hora.' },
  { disciplina: 'Dominação', nivel: 2, nome: 'Hipnotismo', parada: 'Manipulação + Liderança', efeito: 'Implanta uma ordem mais longa e detalhada.' },
  { disciplina: 'Dominação', nivel: 3, nome: 'A Mente Perdida', parada: 'Manipulação + Subterfúgio', efeito: 'Apaga ou altera lembranças da vítima.' },
  { disciplina: 'Dominação', nivel: 4, nome: 'Condicionamento', parada: 'Carisma + Liderança', efeito: 'Torna a vítima obediente de forma duradoura.' },
  { disciplina: 'Dominação', nivel: 5, nome: 'Possessão', parada: 'Manipulação + Intimidação', efeito: 'Assume o controle do corpo de um mortal.' },

  // --- FORTITUDE ------------------------------------------------------------
  { disciplina: 'Fortitude', nivel: 1, nome: 'Resistência Sobrenatural', parada: '—', efeito: 'Soma dados na absorção, inclusive contra dano agravado.' },
  { disciplina: 'Fortitude', nivel: 2, nome: 'Casca de Pedra', parada: '—', efeito: 'Suporta pancadas que derrubariam um mortal.' },
  { disciplina: 'Fortitude', nivel: 3, nome: 'Vontade de Ferro', parada: '—', efeito: 'Aguenta fogo e sol por mais tempo que os outros Kindred.' },
  { disciplina: 'Fortitude', nivel: 4, nome: 'Corpo Inabalável', parada: '—', efeito: 'Ferimentos graves não atrapalham as ações.' },
  { disciplina: 'Fortitude', nivel: 5, nome: 'Carne Imortal', parada: '—', efeito: 'Resiste até ao que costuma destruir um vampiro.' },

  // --- OFUSCAÇÃO ------------------------------------------------------------
  { disciplina: 'Ofuscação', nivel: 1, nome: 'Manto das Sombras', parada: '—', efeito: 'Desaparece se ficar parado junto a alguma sombra.' },
  { disciplina: 'Ofuscação', nivel: 2, nome: 'Presença Invisível', parada: '—', efeito: 'Move-se sem ser notado, mesmo em movimento.' },
  { disciplina: 'Ofuscação', nivel: 3, nome: 'Máscara de Mil Faces', parada: 'Manipulação + Performance', efeito: 'Muda a aparência aos olhos de quem observa.' },
  { disciplina: 'Ofuscação', nivel: 4, nome: 'Desaparecer da Mente', parada: '—', efeito: 'Some enquanto está sendo observado.' },
  { disciplina: 'Ofuscação', nivel: 5, nome: 'Fantasma na Máquina', parada: '—', efeito: 'A ocultação engana até câmeras e gravações.' },

  // --- POTÊNCIA -------------------------------------------------------------
  { disciplina: 'Potência', nivel: 1, nome: 'Força Descomunal', parada: '—', efeito: 'Soma dados em tudo que usa Força; com sangue, vira sucesso automático.' },
  { disciplina: 'Potência', nivel: 2, nome: 'Punho de Ferro', parada: '—', efeito: 'Dano em combate corpo a corpo bem acima do normal.' },
  { disciplina: 'Potência', nivel: 3, nome: 'Salto Prodigioso', parada: '—', efeito: 'Salta alturas e distâncias impossíveis para um mortal.' },
  { disciplina: 'Potência', nivel: 4, nome: 'Quebrar o Aço', parada: '—', efeito: 'Rasga metal e destrói alvenaria com as mãos.' },
  { disciplina: 'Potência', nivel: 5, nome: 'Força Titânica', parada: '—', efeito: 'Levanta e arremessa cargas do tamanho de um carro.' },

  // --- PRESENÇA -------------------------------------------------------------
  { disciplina: 'Presença', nivel: 1, nome: 'Pavor', parada: 'Carisma + Intimidação', efeito: 'Faz os presentes recuarem de medo.' },
  { disciplina: 'Presença', nivel: 2, nome: 'Presença Aterradora', parada: 'Carisma + Expressão', efeito: 'Atrai as atenções e a simpatia de uma sala inteira.' },
  { disciplina: 'Presença', nivel: 3, nome: 'Encantamento', parada: 'Aparência + Empatia', efeito: 'Torna alguém devotado ao vampiro por uma noite.' },
  { disciplina: 'Presença', nivel: 4, nome: 'Convocação', parada: 'Carisma + Subterfúgio', efeito: 'Chama à sua presença alguém que já conheceu, de qualquer distância.' },
  { disciplina: 'Presença', nivel: 5, nome: 'Majestade', parada: 'Carisma + Intimidação', efeito: 'Ninguém consegue agir contra o vampiro enquanto durar.' },

  // --- METAMORFOSE ----------------------------------------------------------
  { disciplina: 'Metamorfose', nivel: 1, nome: 'Olhos da Besta', parada: '—', efeito: 'Enxerga no escuro com olhos brilhantes.' },
  { disciplina: 'Metamorfose', nivel: 2, nome: 'Presas do Lobo', parada: '—', efeito: 'Garras que causam dano agravado.' },
  { disciplina: 'Metamorfose', nivel: 3, nome: 'Fusão com a Terra', parada: '—', efeito: 'Afunda no solo para descansar protegido.' },
  { disciplina: 'Metamorfose', nivel: 4, nome: 'Forma da Besta', parada: '—', efeito: 'Transforma-se em lobo ou morcego.' },
  { disciplina: 'Metamorfose', nivel: 5, nome: 'Forma de Névoa', parada: '—', efeito: 'Vira névoa, imune a ataques físicos.' },

  // --- DEMÊNCIA -------------------------------------------------------------
  { disciplina: 'Demência', nivel: 1, nome: 'Paixão', parada: 'Carisma + Empatia', efeito: 'Amplia ou apaga as emoções da vítima.' },
  { disciplina: 'Demência', nivel: 2, nome: 'Os Sonhos Perdidos', parada: 'Manipulação + Empatia', efeito: 'Enche a mente da vítima de visões perturbadoras.' },
  { disciplina: 'Demência', nivel: 3, nome: 'Alucinação', parada: 'Manipulação + Subterfúgio', efeito: 'Cria ilusões que só a vítima percebe.' },
  { disciplina: 'Demência', nivel: 4, nome: 'Voz da Loucura', parada: 'Manipulação + Intimidação', efeito: 'Induz um surto momentâneo em quem ouve.' },
  { disciplina: 'Demência', nivel: 5, nome: 'Loucura Total', parada: 'Manipulação + Intimidação', efeito: 'Impõe um distúrbio duradouro à vítima.' },

  // --- QUIMERISMO -----------------------------------------------------------
  { disciplina: 'Quimerismo', nivel: 1, nome: 'Ilusão Simples', parada: 'Manipulação + Performance', efeito: 'Cria uma imagem estática que engana um sentido.' },
  { disciplina: 'Quimerismo', nivel: 2, nome: 'Ilusão Completa', parada: 'Manipulação + Performance', efeito: 'A ilusão ganha som, cheiro e movimento.' },
  { disciplina: 'Quimerismo', nivel: 3, nome: 'Ilusão Compartilhada', parada: 'Manipulação + Subterfúgio', efeito: 'Várias pessoas enxergam a mesma cena falsa.' },
  { disciplina: 'Quimerismo', nivel: 4, nome: 'Ilusão Dolorosa', parada: 'Manipulação + Performance', efeito: 'A ilusão machuca quem acredita nela.' },
  { disciplina: 'Quimerismo', nivel: 5, nome: 'Realidade Fabricada', parada: 'Manipulação + Ocultismo', efeito: 'Monta um cenário inteiro que se comporta como real.' },

  // --- TENEBROSIDADE --------------------------------------------------------
  { disciplina: 'Tenebrosidade', nivel: 1, nome: 'Manto de Sombras', parada: '—', efeito: 'Envolve a área em escuridão sobrenatural.' },
  { disciplina: 'Tenebrosidade', nivel: 2, nome: 'Braço do Abismo', parada: 'Destreza + Ocultismo', efeito: 'Um tentáculo de sombra agarra e esmaga.' },
  { disciplina: 'Tenebrosidade', nivel: 3, nome: 'Passo das Sombras', parada: '—', efeito: 'Move-se de uma sombra a outra instantaneamente.' },
  { disciplina: 'Tenebrosidade', nivel: 4, nome: 'Forma do Abismo', parada: '—', efeito: 'O corpo vira sombra viva, difícil de ferir.' },
  { disciplina: 'Tenebrosidade', nivel: 5, nome: 'Tempestade Sombria', parada: 'Manipulação + Ocultismo', efeito: 'Envolve a região numa escuridão devoradora.' },

  // --- VICISSITUDE ----------------------------------------------------------
  { disciplina: 'Vicissitude', nivel: 1, nome: 'Moldar a Carne', parada: 'Destreza + Medicina', efeito: 'Remodela o próprio rosto e corpo.' },
  { disciplina: 'Vicissitude', nivel: 2, nome: 'Talhar a Carne Alheia', parada: 'Destreza + Medicina', efeito: 'Reforma o corpo de outra pessoa, com ou sem consentimento.' },
  { disciplina: 'Vicissitude', nivel: 3, nome: 'Moldar os Ossos', parada: 'Destreza + Medicina', efeito: 'Altera a estrutura óssea, criando lâminas e protuberâncias.' },
  { disciplina: 'Vicissitude', nivel: 4, nome: 'Carne Horrenda', parada: 'Destreza + Medicina', efeito: 'Transforma vítimas em criaturas disformes.' },
  { disciplina: 'Vicissitude', nivel: 5, nome: 'Forma Blindada', parada: '—', efeito: 'O corpo se torna uma armadura viva.' },

  // --- SERPENTIS ------------------------------------------------------------
  { disciplina: 'Serpentis', nivel: 1, nome: 'Olhos da Serpente', parada: 'Carisma + Intimidação', efeito: 'O olhar paralisa quem encara o vampiro.' },
  { disciplina: 'Serpentis', nivel: 2, nome: 'Língua da Serpente', parada: '—', efeito: 'A língua se alonga e corta como lâmina.' },
  { disciplina: 'Serpentis', nivel: 3, nome: 'Pele da Víbora', parada: '—', efeito: 'Escamas cobrem o corpo, protegendo e assustando.' },
  { disciplina: 'Serpentis', nivel: 4, nome: 'Forma do Ofídio', parada: '—', efeito: 'Transforma-se em serpente.' },
  { disciplina: 'Serpentis', nivel: 5, nome: 'Roubo do Coração', parada: 'Força + Ocultismo', efeito: 'Arranca e guarda o coração da vítima.' },

  // --- TANATOSE -------------------------------------------------------------
  { disciplina: 'Tanatose', nivel: 1, nome: 'Palidez do Morto', parada: '—', efeito: 'Aparência de cadáver que engana os vivos.' },
  { disciplina: 'Tanatose', nivel: 2, nome: 'Carne Flácida', parada: '—', efeito: 'O corpo amolece e escapa de amarras.' },
  { disciplina: 'Tanatose', nivel: 3, nome: 'Apodrecimento', parada: 'Destreza + Medicina', efeito: 'Faz a carne alheia apodrecer com o toque.' },
  { disciplina: 'Tanatose', nivel: 4, nome: 'Corpo Desmontado', parada: '—', efeito: 'Separa partes do próprio corpo e continua agindo.' },
  { disciplina: 'Tanatose', nivel: 5, nome: 'Praga do Túmulo', parada: 'Inteligência + Medicina', efeito: 'Espalha doença e decomposição pela região.' },

  // --- OBEAH ----------------------------------------------------------------
  { disciplina: 'Obeah', nivel: 1, nome: 'Sentir a Alma', parada: 'Percepção + Empatia', efeito: 'Percebe feridas do corpo e da mente de alguém.' },
  { disciplina: 'Obeah', nivel: 2, nome: 'Acalmar a Mente', parada: 'Carisma + Empatia', efeito: 'Tira uma pessoa do pânico ou do frenesi.' },
  { disciplina: 'Obeah', nivel: 3, nome: 'Toque Curativo', parada: 'Inteligência + Medicina', efeito: 'Cura ferimentos de mortais e Kindred.' },
  { disciplina: 'Obeah', nivel: 4, nome: 'Renovar a Alma', parada: 'Carisma + Empatia', efeito: 'Restaura Força de Vontade perdida.' },
  { disciplina: 'Obeah', nivel: 5, nome: 'Curar a Alma Ferida', parada: 'Inteligência + Ocultismo', efeito: 'Trata danos profundos de derangement e trilha.' },

  // --- VALEREN --------------------------------------------------------------
  { disciplina: 'Valeren', nivel: 1, nome: 'Sentir a Morte', parada: 'Percepção + Medicina', efeito: 'Percebe quem está ferido e o quanto.' },
  { disciplina: 'Valeren', nivel: 2, nome: 'Toque do Curandeiro', parada: 'Inteligência + Medicina', efeito: 'Cura ferimentos pelo toque.' },
  { disciplina: 'Valeren', nivel: 3, nome: 'Armadura de Fé', parada: '—', efeito: 'Resistência extra em combate por uma cena.' },
  { disciplina: 'Valeren', nivel: 4, nome: 'Punho do Guerreiro', parada: '—', efeito: 'Golpes causam dano agravado contra inimigos da linhagem.' },
  { disciplina: 'Valeren', nivel: 5, nome: 'Despertar o Sangue', parada: 'Manipulação + Ocultismo', efeito: 'Desperta forças adormecidas em aliados ou inimigos.' },

  // --- MORTIS (DARK AGES) ---------------------------------------------------
  { disciplina: 'Mortis', nivel: 1, nome: 'Olhar da Morte', parada: 'Percepção + Ocultismo', efeito: 'Enxerga o quanto a morte ronda uma pessoa.' },
  { disciplina: 'Mortis', nivel: 2, nome: 'Toque Gélido', parada: 'Destreza + Medicina', efeito: 'Rouba o calor e o vigor da vítima.' },
  { disciplina: 'Mortis', nivel: 3, nome: 'Silêncio do Sepulcro', parada: '—', efeito: 'Abafa sons e sufoca a vida ao redor.' },
  { disciplina: 'Mortis', nivel: 4, nome: 'Carne Morta', parada: '—', efeito: 'O corpo se comporta como cadáver, ignorando dor.' },
  { disciplina: 'Mortis', nivel: 5, nome: 'Convocar os Mortos', parada: 'Carisma + Ocultismo', efeito: 'Ergue os mortos do lugar para servir.' }
];

if (typeof window !== 'undefined') window.PODERES_DATA = PODERES_DATA;
