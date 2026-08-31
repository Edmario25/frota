import { Layout } from "@/components/layout/Layout";
import { useObras } from "@/hooks/useObras";
import { AprPanel } from "@/components/sms/AprPanel";
export default function SmsApr() {
  const { obras } = useObras();
  return (
    <Layout>
      <AprPanel obras={obras} />
    </Layout>
  );
}
