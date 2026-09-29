-- Desativa somente o acionamento automatico dos testes agendados.
-- Nao altera agendamentos, execucoes, trabalhos ou a automacao mensal.

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname = 'checklist-automacao-teste-agendado-manaus'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

