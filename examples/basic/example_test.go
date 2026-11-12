package basic_test

import (
	"encoding/json"
	"fmt"
	"time"

	"example.com/basic/models"
)

// A generated model is a plain struct: fill it from your database driver, marshal it as JSON.
func Example() {
	name := "Ada"
	user := models.User{
		Id:        1,
		Email:     "ada@example.com",
		Name:      &name,
		Role:      models.RoleUser,
		CreatedAt: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
		Posts:     []models.Post{{Id: 7, Title: "Hello", AuthorId: 1}},
	}

	out, _ := json.MarshalIndent(user, "", "  ")
	fmt.Println(string(out))
	// Output:
	// {
	//   "id": 1,
	//   "email": "ada@example.com",
	//   "name": "Ada",
	//   "role": "User",
	//   "createdAt": "2026-01-02T03:04:05Z",
	//   "posts": [
	//     {
	//       "id": 7,
	//       "title": "Hello",
	//       "authorId": 1
	//     }
	//   ]
	// }
}
