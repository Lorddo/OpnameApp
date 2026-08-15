-- Allow inspectors to delete photos they can write (defense in depth; API uses service role).

create policy photos_delete_write
on public.photos
for delete
to authenticated
using (
  (select app_private.is_org_member(owner_org_id))
  and (
    source_inspection_id is null
    or (select app_private.can_write_inspection(source_inspection_id))
  )
);
