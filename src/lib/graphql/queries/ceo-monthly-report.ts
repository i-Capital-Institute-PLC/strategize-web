import { gql } from '@apollo/client';

export const GET_CEO_MONTHLY_PERFORMANCE_REPORT = gql`
  query GetCeoMonthlyPerformanceReport($filters: CeoMonthlyReportFiltersInput!) {
    ceoMonthlyPerformanceReport(filters: $filters) {
      periodName
      fiscalYear
      quarterNumber
      monthInQuarter
      calendarMonth
      items {
        kpiId
        kpiName
        strategicObjective
        assigneeType
        unitName
        unitType
        annualTarget
        monthlyTarget
        previousMonthDeviation
        currentMonthActual
        adjustedAchievement
        closingDeviation
        achievementPercentage
      }
    }
  }
`;
