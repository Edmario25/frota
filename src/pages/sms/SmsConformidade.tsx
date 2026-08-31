import { Layout } from "@/components/layout/Layout";
import { useObras } from "@/hooks/useObras";
import { TrainingMatrix } from "@/components/sms/TrainingMatrix";
export default function SmsConformidade() {
  const { obras } = useObras();
  return (
    <Layout>
      <TrainingMatrix obras={obras} />
    </Layout>
  );
}
