DROP POLICY IF EXISTS "Managers manage technicians" ON public.technicians;

CREATE POLICY "Managers manage technicians"
ON public.technicians
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    private.has_role(auth.uid(), 'hotel_manager'::app_role)
    AND (
      (hotel_id IS NOT NULL AND hotel_id = private.current_hotel_id())
      OR (company_id IS NOT NULL AND company_id = private.current_company_id())
    )
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    private.has_role(auth.uid(), 'hotel_manager'::app_role)
    AND (
      (hotel_id IS NOT NULL AND hotel_id = private.current_hotel_id())
      OR (company_id IS NOT NULL AND company_id = private.current_company_id())
    )
  )
);