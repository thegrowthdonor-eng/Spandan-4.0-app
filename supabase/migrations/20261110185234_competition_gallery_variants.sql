do $migration$ begin
  execute replace(pg_get_functiondef('public.public_competition(uuid)'::regprocedure),
    '''image_url'',n.public_media_url',
    '''image_url'',n.public_media_url,''thumbnail_url'',(select m.variants->>''thumb'' from public.media_assets m where m.id=n.media_id and m.state=''public'')');
end $migration$;
