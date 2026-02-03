-- Add DELETE policies for admin/dev users

-- Helper function to check if user is admin or dev
CREATE OR REPLACE FUNCTION public.is_admin_or_dev(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role IN ('admin', 'dev')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow admin/dev to delete puzzles
CREATE POLICY "Admin/dev can delete puzzles"
  ON public.puzzles FOR DELETE
  USING (public.is_admin_or_dev(auth.uid()));

-- Allow admin/dev to insert puzzles (for generation)
CREATE POLICY "Admin/dev can insert puzzles"
  ON public.puzzles FOR INSERT
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

-- Allow admin/dev to update puzzles
CREATE POLICY "Admin/dev can update puzzles"
  ON public.puzzles FOR UPDATE
  USING (public.is_admin_or_dev(auth.uid()));

-- Allow admin/dev to delete from generated_puzzle_pool
CREATE POLICY "Admin/dev can delete from pool"
  ON public.generated_puzzle_pool FOR DELETE
  USING (public.is_admin_or_dev(auth.uid()));

-- Allow admin/dev to insert to generated_puzzle_pool
CREATE POLICY "Admin/dev can insert to pool"
  ON public.generated_puzzle_pool FOR INSERT
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

-- Allow admin/dev to delete daily_challenges
CREATE POLICY "Admin/dev can delete daily challenges"
  ON public.daily_challenges FOR DELETE
  USING (public.is_admin_or_dev(auth.uid()));

-- Allow admin/dev to insert daily_challenges
CREATE POLICY "Admin/dev can insert daily challenges"
  ON public.daily_challenges FOR INSERT
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

-- Allow admin/dev to update daily_challenges
CREATE POLICY "Admin/dev can update daily challenges"
  ON public.daily_challenges FOR UPDATE
  USING (public.is_admin_or_dev(auth.uid()));
