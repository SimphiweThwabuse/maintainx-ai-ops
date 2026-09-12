DROP POLICY IF EXISTS "Staff view related companies" ON public.maintenance_companies;
CREATE POLICY "Staff view related companies" ON public.maintenance_companies
FOR SELECT TO authenticated
USING (
  id = private.current_company_id()
  OR private.has_role(auth.uid(), 'hotel_manager'::app_role)
  OR private.has_role(auth.uid(), 'receptionist'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

CREATE OR REPLACE FUNCTION private.can_view_technician(
  _technician_id uuid,
  _profile_id uuid,
  _hotel_id uuid,
  _company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _profile_id = auth.uid()
    OR private.has_role(auth.uid(), 'hotel_manager'::public.app_role)
    OR private.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      _company_id IS NOT NULL
      AND _company_id = private.current_company_id()
    )
    OR (
      _hotel_id IS NOT NULL
      AND _hotel_id = private.current_hotel_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.tickets tk
      WHERE tk.assigned_technician_id = _technician_id
        AND tk.hotel_id = private.current_hotel_id()
    );
$$;