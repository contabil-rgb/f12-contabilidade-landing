-- Portal de Gestao Contabil - Ampliacao das categorias de listagens
-- Use este script em bases ja existentes para complementar categorias
-- estaveis que hoje o portal ainda mantinha parcialmente em DEFAULT_LISTS.
-- Pode ser executado mais de uma vez com seguranca.

insert into public.listagens (categoria, valor, ordem)
values
  ('situacao', 'Culpa da F12', 5),
  ('situacao', 'Inativo', 6),

  ('competencia_em_dia', 'Sim', 1),
  ('competencia_em_dia', 'Nao', 2),

  ('enviam_documentos', 'Sim', 1),
  ('enviam_documentos', 'Parcialmente', 2),
  ('enviam_documentos', 'Nao', 3),

  ('modo_entrega', 'Manual', 1),
  ('modo_entrega', 'Conta Azul', 2),
  ('modo_entrega', 'Controle Interno', 3),

  ('curva_envio', 'Mensal', 1),
  ('curva_envio', 'Trimestral', 2),
  ('curva_envio', 'Semestral', 3),
  ('curva_envio', 'Anual', 4),

  ('revisado_coordenador', 'Sim', 1),
  ('revisado_coordenador', 'Nao', 2),

  ('lancamentos_padrao', 'Sim', 1),
  ('lancamentos_padrao', 'Nao', 2),

  ('motivo_atraso', 'Docs Atrasados', 1),
  ('motivo_atraso', 'Falta de financeiro rodando', 2),
  ('motivo_atraso', 'Cliente Novo', 3),
  ('motivo_atraso', 'Desorganizacao Interna F12', 4),

  ('risco_multa', 'Alto', 1),
  ('risco_multa', 'Medio', 2),
  ('risco_multa', 'Baixo', 3),

  ('cliente_notificado', 'Sim', 1),
  ('cliente_notificado', 'Nao', 2),

  ('dificuldade', 'Baixa', 1),
  ('dificuldade', 'Media', 2),
  ('dificuldade', 'Alta', 3),
  ('dificuldade', 'Altissima', 4),

  ('ecd', 'Sim', 1),
  ('ecd', 'Nao', 2)
on conflict (categoria, valor) do nothing;
