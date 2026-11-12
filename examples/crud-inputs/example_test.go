package crudinputs_test

import (
	"encoding/json"
	"fmt"

	"example.com/crud-inputs/store"
)

func show(v any) {
	out, _ := json.MarshalIndent(v, "", "  ")
	fmt.Println(string(out))
}

// A where input is data: build it in Go, then translate it to SQL with the library you use, or
// send it as JSON to a service that speaks Prisma's query shape.
func ExampleUserWhereInput() {
	show(store.UserWhereInput{
		Email: &store.StringFilter{Contains: new("@example.com"), Mode: store.QueryModeInsensitive},
		Role:  &store.Filter[store.Role]{In: []store.Role{store.RoleAdmin, store.RoleMember}},
		Orders: &store.OrderListRelationFilter{
			Some: &store.OrderWhereInput{TotalCents: &store.RangeFilter[int]{Gte: new(10_000)}},
		},
	})
	// Output:
	// {
	//   "email": {
	//     "contains": "@example.com",
	//     "mode": "insensitive"
	//   },
	//   "role": {
	//     "in": [
	//       "ADMIN",
	//       "MEMBER"
	//     ]
	//   },
	//   "orders": {
	//     "some": {
	//       "totalCents": {
	//         "gte": 10000
	//       }
	//     }
	//   }
	// }
}

// An update input only carries the columns to change. A nullable column takes a nil Set to store NULL.
func ExampleOrderUncheckedUpdateInput() {
	show(store.OrderUncheckedUpdateInput{
		Status:     &store.FieldUpdate[store.OrderStatus]{Set: store.OrderStatusRefunded},
		TotalCents: &store.NumericFieldUpdate[int]{Decrement: new(500)},
		Note:       &store.NullableFieldUpdate[string]{Set: nil},
	})
	// Output:
	// {
	//   "status": {
	//     "set": "REFUNDED"
	//   },
	//   "totalCents": {
	//     "decrement": 500
	//   },
	//   "note": {
	//     "set": null
	//   }
	// }
}

func ExampleOrderOrderByWithRelationInput() {
	show([]store.OrderOrderByWithRelationInput{
		{Status: store.SortOrderAsc},
		{User: &store.UserOrderByWithRelationInput{Email: store.SortOrderDesc}},
	})
	// Output:
	// [
	//   {
	//     "status": "asc"
	//   },
	//   {
	//     "user": {
	//       "email": "desc"
	//     }
	//   }
	// ]
}
