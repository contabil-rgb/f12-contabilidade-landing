insert into public.listagens (categoria, valor, ordem)
values
  ('tipo_cliente', 'Bodo', 1),
  ('tipo_cliente', 'Tambaqui', 2),
  ('tipo_cliente', 'Salmao', 3),

  ('regime_tributario', 'Simples Nacional', 1),
  ('regime_tributario', 'Lucro Presumido', 2),
  ('regime_tributario', 'Lucro Real', 3),
  ('regime_tributario', 'Isento', 4),

  ('atividades', 'Comercio', 1),
  ('atividades', 'Servico', 2),
  ('atividades', 'Comercio e Servico', 3),
  ('atividades', 'Industria', 4),
  ('atividades', 'Holding', 5),

  ('sim_nao', 'Sim', 1),
  ('sim_nao', 'Nao', 2),

  ('situacao', 'Em dia', 1),
  ('situacao', 'Atencao', 2),
  ('situacao', 'Atrasado', 3),
  ('situacao', 'Critico', 4)
on conflict (categoria, valor) do nothing;
