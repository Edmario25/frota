import { Layout } from "@/components/layout/Layout";
import { useObras } from "@/hooks/useObras";
import { AdmissaoPanel } from "@/components/sms/AdmissaoPanel";
export default function SmsAdmissao() {
  const { obras } = useObras();
  return (
    <Layout>
      <AdmissaoPanel obras={obras} />
    </Layout>
  );
}
