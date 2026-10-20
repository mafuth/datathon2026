import { relations } from 'drizzle-orm';

import { Atoll } from './atoll';
import { Island } from './island';
import { Population } from './population';
import { Service } from './service';
import { TransportConnection } from './transport-connection';
import { TransportRoute } from './transport-route';

export const atollRelations = relations(Atoll, ({ many }) => ({
  islands: many(Island)
}));

export const islandRelations = relations(Island, ({ one, many }) => ({
  atoll: one(Atoll, {
    fields: [Island.atollId],
    references: [Atoll.id]
  }),
  population: many(Population),
  services: many(Service),
  outgoingConnections: many(TransportConnection, { relationName: 'fromIsland' }),
  incomingConnections: many(TransportConnection, { relationName: 'toIsland' })
}));

export const populationRelations = relations(Population, ({ one }) => ({
  island: one(Island, {
    fields: [Population.islandId],
    references: [Island.id]
  })
}));

export const serviceRelations = relations(Service, ({ one }) => ({
  island: one(Island, {
    fields: [Service.islandId],
    references: [Island.id]
  })
}));

export const transportRouteRelations = relations(TransportRoute, ({ many }) => ({
  connections: many(TransportConnection)
}));

export const transportConnectionRelations = relations(TransportConnection, ({ one }) => ({
  route: one(TransportRoute, {
    fields: [TransportConnection.routeId],
    references: [TransportRoute.id]
  }),
  fromIsland: one(Island, {
    relationName: 'fromIsland',
    fields: [TransportConnection.fromIslandId],
    references: [Island.id]
  }),
  toIsland: one(Island, {
    relationName: 'toIsland',
    fields: [TransportConnection.toIslandId],
    references: [Island.id]
  })
}));
