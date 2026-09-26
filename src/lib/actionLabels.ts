/**
 * Korean display names for character actions. Only the UI uses these; API requests,
 * exported file names and JSON keep the original action ids (e.g. "walk1").
 * Unknown ids fall back to the id itself.
 */
const LABELS: Record<string, string> = {
  stand1: "서기 (한손)",
  stand2: "서기 (두손)",
  walk1: "걷기",
  walk2: "걷기 (두손)",
  alert: "경계 자세",
  jump: "점프",
  fly: "비행",
  sit: "앉기",
  prone: "엎드리기",
  proneStab: "엎드려 찌르기",
  ladder: "사다리",
  rope: "밧줄",
  heal: "회복",
  dead: "쓰러짐",
  stabO1: "한손 찌르기 1",
  stabO2: "한손 찌르기 2",
  stabOF: "한손 찌르기 (마무리)",
  stabT1: "두손 찌르기 1",
  stabT2: "두손 찌르기 2",
  stabTF: "두손 찌르기 (마무리)",
  swingO1: "한손 휘두르기 1",
  swingO2: "한손 휘두르기 2",
  swingO3: "한손 휘두르기 3",
  swingOF: "한손 휘두르기 (마무리)",
  swingT1: "두손 휘두르기 1",
  swingT2: "두손 휘두르기 2",
  swingT3: "두손 휘두르기 3",
  swingTF: "두손 휘두르기 (마무리)",
  swingP1: "창 휘두르기 1",
  swingP2: "창 휘두르기 2",
  swingPF: "창 휘두르기 (마무리)",
  shoot1: "쏘기 1",
  shoot2: "쏘기 2",
  shootF: "쏘기 (마무리)",
};

export function actionLabel(action: string): string {
  return LABELS[action] ?? action;
}
