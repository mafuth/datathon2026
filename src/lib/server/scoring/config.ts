export const scoringConfig = {
  domainWeights: {
    health: 1 / 5,
    education: 1 / 5,
    transport: 1 / 5,
    employment: 1 / 5,
    sustainability: 1 / 5
  },
  transportWeights: { land: 1 / 3, marine: 1 / 3, air: 1 / 3 },
  healthQuality: { hospital: 1, health_center: 0.65, clinic: 0.35 },
  healthDemandPolicy: {
    baselineSubtypes: ['hospital', 'health_center', 'clinic'],
    youngerPriority: ['clinic', 'health_center', 'hospital'],
    specialistSubtypes: ['hospital'],
    centralHospitalIslandNames: ['male', 'hulhumale']
  },
  educationQuality: { preschool: 1, school: 1, high_school: 1, tertiary: 1 },
  educationDemandPolicy: {
    centralEducationIslandNames: ['male', 'hulhumale']
  },
  // Density at which the bounded crowdedness pressure reaches 0.5.
  densityReferencePersonsPerKm2: 5000,
  healthCrowdingImpact: 0.2,
  educationCrowdingImpact: 0.25,
  minimumCrowdingFactor: 0.4,
  externalDemandImpact: 0.2,
  minimumExternalDemandFactor: 0.5,
  airConnectionFactor: 0.5,
  transportDemandPolicy: {
    hospitalHubRouting: {
      maleMarineStopNameAliases: ['prost jetty'],
      maleMarineStopNameTokens: ['port', 'jetty', 'ferry terminal'],
      hulhuleAirportStopIds: ['airport:vrmm'],
      hulhuleAirportNameTokens: ['velana international airport', 'hulhule airport']
    }
  },
  hubDemandImpact: 0.2,
  transferDemandShare: 0.25,
  minimumHubFactor: 0.5,
  transportDemandImpact: 0.2,
  minimumTransportStopFactor: 0.5,
  transportStopCapacityProxyByMode: {
    land: 1.5,
    marine: 2,
    air: 3
  },
  serviceHeatmap: {
    facilityPressureWeight: 0.5,
    residentialAccessGapWeight: 0.5,
    serviceInfluenceSigmaMeters: 260,
    residentialInfluenceSigmaMeters: 260
  },
  hubCapacityProxyByType: {
    airport: 2,
    ferry_terminal: 1.5,
    land_gateway: 2,
    transfer: 1.5
  },
  sustainability: {
    vehicleCategoryPollutionFactors: {
      total: 1,
      motor_cycle: 0.55,
      car: 1,
      bus: 1.4,
      pick_up: 1.2,
      lorry: 1.6,
      van: 1.1,
      jeep: 1.15,
      battery_scooter: 0,
      other: 1.25
    },
    modePollutionFactors: {
      privateVehicle: 1,
      // Relative pollution per resident-equivalent trip. Bus and ferry are
      // lower-impact alternatives to private travel; air remains high-impact.
      busLand: 0.35,
      jettyMarine: 0.55,
      airportAir: 2.5
    },
    publicTransportRelianceReferenceVehiclesPerThousand: 600,
    pollutionPressureReference: 2
  }
} as const;
